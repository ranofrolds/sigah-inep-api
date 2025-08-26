const { chromium } = require('playwright');
const fs = require('fs');

async function debugPage() {
  console.log('🔍 Iniciando debug da página INEP...\n');
  
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'pt-BR'
    });
    
    const page = await context.newPage();
    
    console.log('📍 Navegando para a página...');
    await page.goto('https://anonymousdata.inep.gov.br/analytics/saw.dll?Dashboard&PortalPath=%2Fshared%2FCenso%20da%20Educa%C3%A7%C3%A3o%20B%C3%A1sica%2F_portal%2FCat%C3%A1logo%20de%20Escolas&Page=Pr%C3%A9-Lista%20das%20Escolas', {
      waitUntil: 'networkidle',
      timeout: 60000
    });
    
    // Aguardar mais tempo para garantir que tudo carregou
    console.log('⏳ Aguardando carregamento completo...');
    await page.waitForTimeout(10000);
    
    // 1. Verificar se há iframes
    const frames = page.frames();
    console.log(`\n📊 Número de frames na página: ${frames.length}`);
    
    if (frames.length > 1) {
      console.log('⚠️ A página contém iframes! Listando:');
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        console.log(`  Frame ${i}: ${frame.name() || frame.url()}`);
      }
    }
    
    // 2. Buscar elementos de filtro por diferentes estratégias
    console.log('\n🔍 Procurando elementos de filtro...\n');
    
    // Estratégia 1: Buscar por texto/label
    const filterTexts = ['Região', 'UF', 'Município', 'Situação', 'Localização', 'Categoria', 'Dependência', 'Etapa', 'Porte'];
    
    for (const text of filterTexts) {
      const elements = await page.$$(`text=${text}`);
      if (elements.length > 0) {
        console.log(`✅ Encontrado elemento com texto "${text}": ${elements.length} ocorrência(s)`);
        
        // Tentar encontrar input próximo
        for (const element of elements) {
          const parent = await element.$('xpath=..');
          if (parent) {
            const input = await parent.$('input, select');
            if (input) {
              const id = await input.getAttribute('id');
              const name = await input.getAttribute('name');
              const className = await input.getAttribute('class');
              console.log(`   Input encontrado - ID: ${id}, Name: ${name}, Class: ${className}`);
            }
          }
        }
      }
    }
    
    // Estratégia 2: Buscar todos os inputs/selects
    console.log('\n📝 Listando todos os campos de entrada:');
    
    const inputs = await page.$$('input[type="text"], input[type="search"], select');
    console.log(`Total de inputs encontrados: ${inputs.length}\n`);
    
    for (let i = 0; i < Math.min(inputs.length, 20); i++) {
      const input = inputs[i];
      const id = await input.getAttribute('id');
      const name = await input.getAttribute('name');
      const placeholder = await input.getAttribute('placeholder');
      const value = await input.getAttribute('value');
      const className = await input.getAttribute('class');
      
      if (id || name || placeholder) {
        console.log(`Input ${i + 1}:`);
        console.log(`  ID: ${id || 'N/A'}`);
        console.log(`  Name: ${name || 'N/A'}`);
        console.log(`  Placeholder: ${placeholder || 'N/A'}`);
        console.log(`  Value: ${value || 'vazio'}`);
        console.log(`  Class: ${className || 'N/A'}`);
        console.log('');
      }
    }
    
    // Estratégia 3: Buscar elementos com IDs que começam com "saw"
    console.log('🔍 Procurando elementos com IDs "saw_"...');
    const sawElements = await page.$$('[id^="saw"]');
    console.log(`Encontrados ${sawElements.length} elementos com ID começando com "saw"\n`);
    
    if (sawElements.length > 0) {
      for (let i = 0; i < Math.min(sawElements.length, 10); i++) {
        const element = sawElements[i];
        const id = await element.getAttribute('id');
        const tagName = await element.evaluate(el => el.tagName);
        const text = await element.textContent();
        console.log(`  ${tagName}#${id}: "${text?.substring(0, 50)}..."`);
      }
    }
    
    // 4. Buscar botões
    console.log('\n🔘 Procurando botões:');
    const buttons = await page.$$('button, input[type="button"], input[type="submit"], a.button');
    console.log(`Total de botões encontrados: ${buttons.length}\n`);
    
    for (let i = 0; i < Math.min(buttons.length, 10); i++) {
      const button = buttons[i];
      const text = await button.textContent();
      const value = await button.getAttribute('value');
      const id = await button.getAttribute('id');
      const onclick = await button.getAttribute('onclick');
      
      if (text?.trim() || value) {
        console.log(`Botão ${i + 1}:`);
        console.log(`  Texto: ${text?.trim() || 'N/A'}`);
        console.log(`  Value: ${value || 'N/A'}`);
        console.log(`  ID: ${id || 'N/A'}`);
        if (onclick) console.log(`  OnClick: ${onclick.substring(0, 50)}...`);
        console.log('');
      }
    }
    
    // 5. Salvar HTML para análise
    console.log('💾 Salvando HTML da página...');
    const html = await page.content();
    fs.writeFileSync('debug_page.html', html);
    console.log('✅ HTML salvo em debug_page.html');
    
    // 6. Verificar se há algum form
    const forms = await page.$$('form');
    console.log(`\n📋 Formulários encontrados: ${forms.length}`);
    
    // 7. Screenshot com anotações
    await page.screenshot({ path: 'debug_full_page.png', fullPage: true });
    console.log('📸 Screenshot salvo: debug_full_page.png');
    
    // 8. Tentar detectar framework/biblioteca
    const hasJQuery = await page.evaluate(() => typeof jQuery !== 'undefined');
    const hasAngular = await page.evaluate(() => typeof angular !== 'undefined');
    const hasReact = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      for (let element of allElements) {
        const keys = Object.keys(element);
        if (keys.some(key => key.startsWith('__react'))) return true;
      }
      return false;
    });
    
    console.log('\n🛠️ Tecnologias detectadas:');
    console.log(`  jQuery: ${hasJQuery ? '✅' : '❌'}`);
    console.log(`  Angular: ${hasAngular ? '✅' : '❌'}`);
    console.log(`  React: ${hasReact ? '✅' : '❌'}`);
    
    console.log('\n✅ Debug concluído!');
    console.log('\n📌 Próximos passos:');
    console.log('1. Verifique o arquivo debug_page.html');
    console.log('2. Procure pelos IDs/classes corretos dos elementos');
    console.log('3. Verifique se precisa interagir com iframes');
    console.log('4. Considere aguardar elementos específicos com waitForSelector()');
    
  } catch (error) {
    console.error('❌ Erro durante debug:', error.message);
  } finally {
    console.log('\n⏸️ Browser permanecerá aberto para inspeção manual.');
    console.log('Pressione Ctrl+C para fechar...');
  }
}

// Executar
debugPage().catch(console.error);