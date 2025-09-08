const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('../config');

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
    
    await navigateToInepSite(page);
    await configureRegionFilter(page);
    await applyFilters(page);
    await logSchoolCount(page);
    
    return await downloadCsvFile(page);
    
  } finally {
    await browser.close();
  }
}

function ensureDownloadDirectory() {
  if (!fs.existsSync(config.inep.downloadPath)) {
    fs.mkdirSync(config.inep.downloadPath, { recursive: true });
  }
}

async function navigateToInepSite(page) {
  console.log('📍 Acessando site do INEP...');
  await page.goto(config.inep.url, { waitUntil: 'networkidle' });
  await page.waitForSelector('input[id^="saw_"]', { timeout: 30000 });
  await page.waitForTimeout(2000);
}

async function configureRegionFilter(page) {
  console.log('🔧 Configurando filtro de Região...');
  
  const dropdownIcons = await page.$$('img[id$="_dropdownIcon"]');
  
  for (const icon of dropdownIcons) {
    const iconId = await icon.getAttribute('id');
    const inputId = iconId.replace('_dropdownIcon', '');
    const input = await page.$(`#${inputId}`);
    
    if (input && await isRegionField(input)) {
      await configureRegionDropdown(page, icon);
      return;
    }
  }
  
  console.log('⚠️ Campo de Região não encontrado, continuando...');
}

async function isRegionField(input) {
  const container = await input.evaluateHandle(el => el.closest('tr'));
  const labelText = await container.evaluate(el => {
    const td = el.querySelector('td:first-child');
    return td ? td.textContent.trim() : '';
  });
  return labelText.includes('Região');
}

async function configureRegionDropdown(page, icon) {
  await icon.click();
  await page.waitForTimeout(1000);
  
  const checkbox = await page.waitForSelector(
    'div.DropDownValueList input[type="checkbox"]:first-child',
    { timeout: 5000 }
  );
  
  if (checkbox && !(await checkbox.isChecked())) {
    await checkbox.click();
    console.log('✅ "Todos os Valores" selecionado');
  }
  
  await icon.click();
  await page.waitForTimeout(1000);
}

async function applyFilters(page) {
  console.log('🔍 Aplicando filtros...');
  const applyButton = await page.waitForSelector('a:text("Aplicar")', { timeout: 5000 });
  await applyButton.click();
  
  console.log('⏳ Aguardando processamento...');
  await page.waitForTimeout(5000);
}

async function logSchoolCount(page) {
  try {
    const bodyText = await page.textContent('body');
    const match = bodyText.match(/Foram selecionadas[^0-9]*([0-9.]+)[^0-9]*escolas/);
    if (match) {
      console.log(`📊 ${match[0]}`);
    }
  } catch {
    // Ignore if can't find school count
  }
}

async function downloadCsvFile(page) {
  console.log('💾 Baixando arquivo CSV...');
  
  const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
  
  const exportLink = await page.waitForSelector('a[onclick*="csv" i], a:text("Exportar")', {
    timeout: 5000
  });
  await exportLink.click();
  
  const download = await downloadPromise;
  const fileName = generateFileName();
  const savePath = path.join(config.inep.downloadPath, fileName);
  
  await download.saveAs(savePath);
  
  logDownloadComplete(savePath);
  return savePath;
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