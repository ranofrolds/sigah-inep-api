const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// O export CSV do INEP corta em 100.000 linhas; cada região fica abaixo disso.
const INEP_EXPORT_ROW_LIMIT = 100000;
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
    const regionFiles = [];

    try {
      for (const region of REGIONS) {
        regionFiles.push(await downloadRegion(page, region));
      }

      return mergeCsvFiles(regionFiles, path.join(config.inep.downloadPath, generateFileName()));
    } finally {
      regionFiles.forEach(file => fs.rmSync(file, { force: true }));
    }
    
  } finally {
    await browser.close();
  }
}

async function downloadRegion(page, region) {
  console.log(`🗺️ Região: ${region}`);

  await navigateToInepSite(page);
  await selectRegion(page, region);
  await applyFilters(page);
  const expectedRows = await readSchoolCount(page, region);

  if (expectedRows >= INEP_EXPORT_ROW_LIMIT) {
    throw new Error(`Região ${region} tem ${expectedRows} escolas, acima do limite de ${INEP_EXPORT_ROW_LIMIT} do export do INEP: dividir o download por UF`);
  }

  const filePath = await downloadCsvFile(page, `regiao_${region}.tmp`);
  assertComplete(filePath, region, expectedRows);
  return filePath;
}

function ensureDownloadDirectory() {
  if (!fs.existsSync(config.inep.downloadPath)) {
    fs.mkdirSync(config.inep.downloadPath, { recursive: true });
  }
}

async function navigateToInepSite(page) {
  console.log('📍 Acessando site do INEP...');
  // networkidle nunca chega: o dashboard do INEP fica fazendo requisições em segundo plano
  await page.goto(config.inep.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('input[id^="saw_"]', { timeout: 90000 });
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

async function applyFilters(page) {
  console.log('🔍 Aplicando filtros...');
  const applyButton = await page.waitForSelector('a:text("Aplicar")', { timeout: 5000 });
  await applyButton.click();
  
  console.log('⏳ Aguardando processamento...');
  await page.waitForTimeout(5000);
}

// Sem esse total não dá para saber se o CSV veio cortado, então falha em vez de seguir.
async function readSchoolCount(page, region) {
  const bodyText = await page.textContent('body');
  const match = bodyText.match(/Foram selecionadas[^0-9]*([0-9.]+)[^0-9]*escolas/);

  if (!match) {
    throw new Error(`Total de escolas da região ${region} não encontrado na página do INEP`);
  }

  console.log(`📊 ${match[0]}`);
  return parseInt(match[1].replace(/\./g, ''), 10);
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

// Mantém o cabeçalho (com BOM) do primeiro arquivo e descarta o dos demais.
function mergeCsvFiles(filePaths, outputPath) {
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