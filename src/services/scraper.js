const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// O export CSV do INEP corta em 100.000 linhas; cada região fica abaixo disso.
const INEP_EXPORT_ROW_LIMIT = 100000;
const REGION_ATTEMPTS = 3;
const COUNT_WAIT_TIMEOUT_MS = 120000;
const COUNT_SETTLE_MS = 3000;
const COUNT_POLL_INTERVAL_MS = 1000;
const PAGE_TIMEOUT_MS = 120000;
const COUNT_PATTERN = /Foram selecionadas[^0-9]*([0-9.]+)[^0-9]*escolas/;
const REGIONS = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];

async function downloadInepData() {
  console.log('🚀 Iniciando download do catálogo INEP...');
  
  ensureDownloadDirectory();
  
  const browser = await chromium.launch({ 
    headless: config.inep.headless 
  });

  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      locale: 'pt-BR'
    });
    
    const page = await context.newPage();
    const regionResults = [];

    try {
      const unfilteredTotal = await withRetries('Total geral', () => readUnfilteredTotal(page));

      for (const region of REGIONS) {
        regionResults.push(await withRetries(region, () => tryDownloadRegion(page, region, unfilteredTotal)));
      }

      assertSumMatchesTotal(regionResults, unfilteredTotal);
      const regionFiles = regionResults.map(result => result.filePath);
      return mergeCsvFiles(regionFiles, path.join(config.inep.downloadPath, generateFileName()));
    } finally {
      regionResults.forEach(result => fs.rmSync(result.filePath, { force: true }));
    }
    
  } finally {
    await browser.close();
  }
}

class LimitExceededError extends Error {}

async function withRetries(label, action) {
  let lastError;

  for (let attempt = 1; attempt <= REGION_ATTEMPTS; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (error instanceof LimitExceededError) {
        throw error;
      }
      lastError = error;
      console.log(`⚠️ ${label}: tentativa ${attempt}/${REGION_ATTEMPTS} falhou: ${error.message}`);
    }
  }

  throw lastError;
}

// Total sem filtro de região ("Todos os Valores"): serve para conferir a soma e para
// reconhecer o valor transitório que a página mostra antes de aplicar o filtro.
async function readUnfilteredTotal(page) {
  console.log('🧮 Lendo o total geral do INEP...');
  await navigateToInepSite(page);
  const countText = await applyAndWaitForCount(page, null, 'geral');
  return parseCount(countText);
}

async function tryDownloadRegion(page, region, unfilteredTotal) {
  console.log(`🗺️ Região: ${region}`);

  await navigateToInepSite(page);
  await selectRegion(page, region);
  const expectedRows = parseCount(await applyAndWaitForCount(page, unfilteredTotal, `da região ${region}`));

  if (expectedRows >= INEP_EXPORT_ROW_LIMIT) {
    throw new LimitExceededError(`Região ${region} tem ${expectedRows} escolas, acima do limite de ${INEP_EXPORT_ROW_LIMIT} do export do INEP: dividir o download por UF`);
  }

  const filePath = await downloadCsvFile(page, `regiao_${region}.tmp`);
  assertComplete(filePath, region, expectedRows);
  return { filePath, rows: expectedRows };
}

function ensureDownloadDirectory() {
  if (!fs.existsSync(config.inep.downloadPath)) {
    fs.mkdirSync(config.inep.downloadPath, { recursive: true });
  }
}

async function navigateToInepSite(page) {
  console.log('📍 Acessando site do INEP...');
  // networkidle nunca chega: o dashboard do INEP fica fazendo requisições em segundo plano
  await page.goto(config.inep.url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
  await page.waitForSelector('input[id^="saw_"]', { timeout: PAGE_TIMEOUT_MS });
  await page.waitForTimeout(2000);
}

async function selectRegion(page, region) {
  const icon = await findRegionDropdownIcon(page);
  
  if (!icon) {
    throw new Error('Campo de Região não encontrado na página do INEP');
  }

  await icon.click();
  await page.waitForTimeout(1000);

  const checkbox = await page.waitForSelector(
    `div.DropDownValueList input[type="checkbox"][value="${region}"]`,
    { timeout: 5000 }
  );

  if (!(await checkbox.isChecked())) {
    await checkbox.click();
  }

  await icon.click();
  await page.waitForTimeout(1000);
}

async function findRegionDropdownIcon(page) {
  const dropdownIcons = await page.$$('img[id$="_dropdownIcon"]');
  
  for (const icon of dropdownIcons) {
    const iconId = await icon.getAttribute('id');
    const inputId = iconId.replace('_dropdownIcon', '');
    const input = await page.$(`#${inputId}`);
    
    if (input && await isRegionField(input)) {
      return icon;
    }
  }
  
  return null;
}

async function isRegionField(input) {
  const container = await input.evaluateHandle(el => el.closest('tr'));
  const labelText = await container.evaluate(el => {
    const td = el.querySelector('td:first-child');
    return td ? td.textContent.trim() : '';
  });
  return labelText.includes('Região');
}

async function applyAndWaitForCount(page, rejectedTotal, label) {
  console.log('🔍 Aplicando filtros...');
  const applyButton = await page.waitForSelector('a:text("Aplicar")', { timeout: 30000 });
  await applyButton.click();

  console.log('⏳ Aguardando o total...');
  const countText = await waitForCountText(page, rejectedTotal, label);
  console.log(`📊 ${countText}`);
  return countText;
}

async function readCountText(page) {
  const bodyText = await page.textContent('body');
  const match = bodyText.match(COUNT_PATTERN);
  return match ? match[0] : null;
}

// Sem esse total não dá para saber se o CSV veio cortado, então falha em vez de seguir.
// Ignora o total geral (valor transitório de antes do filtro valer) e espera o valor assentar.
async function waitForCountText(page, rejectedTotal, label) {
  const deadline = Date.now() + COUNT_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const text = await readCountText(page);

    if (text && parseCount(text) !== rejectedTotal) {
      await page.waitForTimeout(COUNT_SETTLE_MS);
      const settled = await readCountText(page);

      if (settled && parseCount(settled) !== rejectedTotal) {
        return settled;
      }
    }

    await page.waitForTimeout(COUNT_POLL_INTERVAL_MS);
  }

  throw new Error(`Total de escolas ${label} não apareceu na página do INEP em ${COUNT_WAIT_TIMEOUT_MS / 1000}s`);
}

function parseCount(countText) {
  return parseInt(countText.match(COUNT_PATTERN)[1].replace(/\./g, ''), 10);
}

async function downloadCsvFile(page, fileName) {
  console.log('💾 Baixando arquivo CSV...');
  
  const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
  
  const exportLink = await page.waitForSelector('a[onclick*="csv" i], a:text("Exportar")', {
    timeout: 5000
  });
  await exportLink.click();
  
  const download = await downloadPromise;
  const savePath = path.join(config.inep.downloadPath, fileName);
  
  await download.saveAs(savePath);
  return savePath;
}

function readCsvLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(line => line.length > 0);
}

function assertComplete(filePath, region, expectedRows) {
  const dataRows = readCsvLines(filePath).length - 1;

  if (dataRows !== expectedRows) {
    throw new Error(`Export da região ${region} veio com ${dataRows} escolas, mas a página do INEP mostra ${expectedRows}`);
  }

  console.log(`✅ ${region}: ${dataRows} escolas`);
}

// Confere a soma das regiões com o total sem filtro mostrado na página (quando ele aparece).
function assertSumMatchesTotal(regionResults, unfilteredTotal) {
  const sum = regionResults.reduce((acc, result) => acc + result.rows, 0);

  if (sum !== unfilteredTotal) {
    throw new Error(`Soma das regiões (${sum}) difere do total do INEP sem filtro (${unfilteredTotal})`);
  }

  console.log(`✅ Soma das regiões confere com o total do INEP: ${unfilteredTotal}`);
}

function assertSameHeader(filePaths) {
  const [expected, ...others] = filePaths.map(file => readCsvLines(file)[0]);

  if (others.some(header => header !== expected)) {
    throw new Error('Cabeçalhos dos CSVs das regiões são diferentes: junção abortada');
  }
}

// Mantém o cabeçalho (com BOM) do primeiro arquivo e descarta o dos demais.
function mergeCsvFiles(filePaths, outputPath) {
  assertSameHeader(filePaths);
  const [firstFile, ...otherFiles] = filePaths;
  const lines = [
    ...readCsvLines(firstFile),
    ...otherFiles.flatMap(file => readCsvLines(file).slice(1))
  ];

  fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8');

  logDownloadComplete(outputPath);
  return outputPath;
}

function generateFileName() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `catalogo_escolas_${timestamp}.csv`;
}

function logDownloadComplete(savePath) {
  const stats = fs.statSync(savePath);
  const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
  
  console.log('✅ Download concluído!');
  console.log(`📁 Arquivo: ${savePath}`);
  console.log(`📊 Tamanho: ${fileSizeInMB} MB`);
}

module.exports = { downloadInepData };