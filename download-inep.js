const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuração
const CONFIG = {
  url: 'https://anonymousdata.inep.gov.br/analytics/saw.dll?Dashboard&PortalPath=%2Fshared%2FCenso%20da%20Educa%C3%A7%C3%A3o%20B%C3%A1sica%2F_portal%2FCat%C3%A1logo%20de%20Escolas&Page=Pr%C3%A9-Lista%20das%20Escolas',
  downloadPath: './downloads',
  headless: true // Mudar para false se quiser ver o browser
};

async function downloadINEP() {
  console.log('🚀 Iniciando download do catálogo INEP...\n');
  
  // Criar pasta de download
  if (!fs.existsSync(CONFIG.downloadPath)) {
    fs.mkdirSync(CONFIG.downloadPath, { recursive: true });
  }
  
  // Iniciar browser
  const browser = await chromium.launch({ 
    headless: CONFIG.headless 
  });
  
  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      locale: 'pt-BR'
    });
    
    const page = await context.newPage();
    
    // Navegar para a página
    console.log('📍 Acessando site do INEP...');
    await page.goto(CONFIG.url, { waitUntil: 'networkidle' });
    
    // Aguardar página carregar
    await page.waitForSelector('input[id^="saw_"]', { timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Encontrar e configurar campo de Região
    console.log('🔧 Configurando filtro de Região...');
    
    // Buscar dropdown de Região
    const dropdownIcons = await page.$$('img[id$="_dropdownIcon"]');
    let regionConfigured = false;
    
    for (const icon of dropdownIcons) {
      const iconId = await icon.getAttribute('id');
      const inputId = iconId.replace('_dropdownIcon', '');
      const input = await page.$(`#${inputId}`);
      
      if (input) {
        // Verificar se é o campo de Região
        const container = await input.evaluateHandle(el => el.closest('tr'));
        const labelText = await container.evaluate(el => {
          const td = el.querySelector('td:first-child');
          return td ? td.textContent.trim() : '';
        });
        
        if (labelText.includes('Região')) {
          console.log(`   ✅ Campo de Região encontrado`);
          
          // Abrir dropdown
          await icon.click();
          await page.waitForTimeout(1000);
          
          // Marcar "Todos os Valores" (primeira checkbox)
          const checkbox = await page.waitForSelector(
            'div.DropDownValueList input[type="checkbox"]:first-child',
            { timeout: 5000 }
          );
          
          if (checkbox) {
            const isChecked = await checkbox.isChecked();
            if (!isChecked) {
              await checkbox.click();
            }
            console.log('   ✅ "Todos os Valores" selecionado');
          }
          
          // Fechar dropdown
          await icon.click();
          await page.waitForTimeout(1000);
          
          regionConfigured = true;
          break;
        }
      }
    }
    
    if (!regionConfigured) {
      console.log('   ⚠️ Campo de Região não encontrado, continuando...');
    }
    
    // Aplicar filtros
    console.log('🔍 Aplicando filtros...');
    const applyButton = await page.waitForSelector('a:text("Aplicar")', { timeout: 5000 });
    await applyButton.click();
    
    // Aguardar processamento
    console.log('⏳ Aguardando processamento...');
    await page.waitForTimeout(5000);
    
    // Verificar quantidade de escolas
    try {
      const bodyText = await page.textContent('body');
      const match = bodyText.match(/Foram selecionadas[^0-9]*([0-9.]+)[^0-9]*escolas/);
      if (match) {
        console.log(`📊 ${match[0]}\n`);
      }
    } catch {}
    
    // Baixar CSV
    console.log('💾 Baixando arquivo CSV...');
    
    // Configurar download
    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    
    // Buscar e clicar no link de exportação
    const exportLink = await page.waitForSelector('a[onclick*="csv" i], a:text("Exportar")', {
      timeout: 5000
    });
    await exportLink.click();
    
    // Aguardar e salvar download
    const download = await downloadPromise;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const fileName = `catalogo_escolas_${timestamp}.csv`;
    const savePath = path.join(CONFIG.downloadPath, fileName);
    
    await download.saveAs(savePath);
    
    // Verificar tamanho do arquivo
    const stats = fs.statSync(savePath);
    const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    console.log('\n✅ Download concluído!');
    console.log(`📁 Arquivo: ${savePath}`);
    console.log(`📊 Tamanho: ${fileSizeInMB} MB`);
    
    return savePath;
    
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

// Executar
if (require.main === module) {
  downloadINEP()
    .then(() => {
      console.log('\n✨ Processo finalizado com sucesso!');
    })
    .catch(error => {
      console.error('\n💥 Erro fatal:', error.message);
      process.exit(1);
    });
}

module.exports = downloadINEP;