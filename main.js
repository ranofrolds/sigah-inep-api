const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Configurações
const CONFIG = {
  url: 'https://anonymousdata.inep.gov.br/analytics/saw.dll?Dashboard&PortalPath=%2Fshared%2FCenso%20da%20Educa%C3%A7%C3%A3o%20B%C3%A1sica%2F_portal%2FCat%C3%A1logo%20de%20Escolas&Page=Pr%C3%A9-Lista%20das%20Escolas',
  downloadPath: './downloads',
  timeout: 120000,
  headless: false, // Mude para true para rodar mais rápido (sem interface)
  debugMode: false, // Mude para true para screenshots e logs detalhados
  fastMode: true   // Modo rápido com timeouts menores
};

// Campos obrigatórios que devem ser configurados com "Todos os Valores"
const REQUIRED_DROPDOWN_FIELDS = [
  'Região',
  'UF', 
  'Município',
  'Situação Funcionamento',
  'Localização',
  'Localização Diferenciada',
  'Categoria Administrativa',
  'Dependência Administrativa',
  'Etapa e Modalidade de Ensino',
  'Porte da Escola (Matrículas)'
];

// Mapeamento de dependências hierárquicas
const FIELD_DEPENDENCIES = {
  'UF': ['Região'],           // UF depende de Região
  'Município': ['Região', 'UF'] // Município depende de Região e UF
};

// Função para verificar se um campo deve ser pulado devido a dependências
function shouldSkipFieldDueToDependency(field, configuredFields) {
  // Verifica por nome do campo (removendo pontos iniciais)
  const fieldName = field.label.replace(/^\.\s*/, '');
  const dependencies = FIELD_DEPENDENCIES[fieldName];
  if (!dependencies) return { skip: false };
  
  // Verifica se alguma dependência foi configurada com "Todas"
  for (const dependency of dependencies) {
    const dependentField = configuredFields.find(f => 
      f.label.includes(dependency) || f.label.replace(/^\.\s*/, '') === dependency
    );
    if (dependentField && dependentField.hasAllValues) {
      return { skip: true, reason: `${dependency} está configurado com "Todas os Valores"` };
    }
  }
  
  return { skip: false };
}

/**
 * Cria diretório de download
 */
function ensureDownloadDir() {
  if (!fs.existsSync(CONFIG.downloadPath)) {
    fs.mkdirSync(CONFIG.downloadPath, { recursive: true });
    console.log(`📁 Diretório ${CONFIG.downloadPath} criado.`);
  }
}

/**
 * Tira screenshot para debug
 */
async function takeDebugScreenshot(page, name) {
  if (CONFIG.debugMode) {
    const screenshotPath = `debug_${name}_${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot: ${screenshotPath}`);
  }
}

/**
 * Detecta quais campos têm dropdown (ícone de seta)
 */
async function detectDropdownFields(page) {
  console.log('🔍 Detectando campos com dropdown...\n');
  
  const dropdownFields = [];
  
  // Buscar todos os ícones de dropdown
  const dropdownIcons = await page.$$('img[id$="_dropdownIcon"]');
  
  for (const icon of dropdownIcons) {
    const iconId = await icon.getAttribute('id');
    const inputId = iconId.replace('_dropdownIcon', '');
    
    // Verificar se o input existe
    const input = await page.$(`#${inputId}`);
    if (input) {
      // Tentar identificar o campo pelo contexto
      const container = await input.evaluateHandle(el => el.closest('td, div.masterCustomDropDown, tr'));
      const labelText = await container.evaluate(el => {
        // Estratégia 1: Procurar label no td anterior
        const prevTd = el.previousElementSibling;
        if (prevTd && prevTd.textContent) {
          const text = prevTd.textContent.trim().replace(':', '').replace('.', '');
          if (text.length > 0) return text;
        }
        
        // Estratégia 2: Procurar no aria-label
        const ariaLabel = el.querySelector('label[id*="aria_label"]');
        if (ariaLabel) {
          const match = ariaLabel.textContent.match(/([^:,]+):/);
          if (match) return match[1].trim();
        }
        
        // Estratégia 3: Procurar no tr parent, primeiro td
        const tr = el.closest('tr');
        if (tr) {
          const firstTd = tr.querySelector('td:first-child');
          if (firstTd && firstTd.textContent) {
            const text = firstTd.textContent.trim().replace(':', '').replace('.', '');
            if (text.length > 0) return text;
          }
        }
        
        // Estratégia 4: Procurar por label associado
        const inputEl = el.querySelector('input');
        if (inputEl && inputEl.id) {
          const label = document.querySelector(`label[for="${inputEl.id}"]`);
          if (label) {
            return label.textContent.trim().replace(':', '').replace('.', '');
          }
        }
        
        return null;
      });
      
      dropdownFields.push({
        inputId: inputId,
        iconId: iconId,
        label: labelText || 'Campo sem label'
      });
      
      console.log(`✅ Encontrado: ${labelText || 'Campo'} (#${inputId})`);
    }
  }
  
  return dropdownFields;
}

/**
 * Configura dropdown com checkbox para "Todos os Valores"
 */
async function configureDropdownCheckbox(page, field) {
  try {
    console.log(`\n📝 Configurando: ${field.label}`);
    
    // Tentar aguardar os elementos aparecerem com timeout mais generoso
    let input, icon;
    try {
      input = await page.waitForSelector(`#${field.inputId}`, { 
        timeout: CONFIG.fastMode ? 3000 : 5000,
        state: 'attached'
      });
      icon = await page.waitForSelector(`#${field.iconId}`, { 
        timeout: CONFIG.fastMode ? 1000 : 2000,
        state: 'attached'
      });
    } catch (timeoutError) {
      console.log(`   ⚠️ Elementos não encontrados (timeout: ${timeoutError.message.includes('Timeout') ? 'aguardando elementos' : 'não existem'})`);
      return { success: false, hasAllValues: false };
    }
    
    if (!input || !icon) {
      console.log(`   ⚠️ Elementos não encontrados`);
      return { success: false, hasAllValues: false };
    }
    
    // Verificar se o campo está visível e habilitado
    const isVisible = await input.isVisible();
    const isEnabled = await input.isEnabled();
    
    if (!isVisible) {
      console.log(`   ⚠️ Campo não está visível (possivelmente oculto por dependência)`);
      return { success: false, hasAllValues: false, reason: 'hidden' };
    }
    
    if (!isEnabled) {
      console.log(`   ⚠️ Campo está desabilitado (possivelmente por dependência hierárquica)`);
      return { success: false, hasAllValues: false, reason: 'disabled' };
    }
    
    // Verificar valor atual
    const currentValue = await input.inputValue();
    console.log(`   Valor atual: "${currentValue}"`);
    
    // Se já tem "Todos" no valor, pode pular
    if (currentValue.includes('Todos os Valores')) {
      console.log(`   ✅ Já configurado com "Todos os Valores"`);
      return { success: true, hasAllValues: true };
    }
    
    // Clicar no ícone para abrir dropdown
    await icon.click();
    console.log(`   🔽 Dropdown aberto`);
    
    // Aguardar menu aparecer (menos tempo se fastMode)
    await page.waitForTimeout(CONFIG.fastMode ? 500 : 1500);
    
    // Estratégias para encontrar e marcar checkbox "Todos os Valores"
    const checkboxSelectors = [
      // Checkbox específico para "Todos os Valores"
      'input[type="checkbox"][id*="All"]',
      'input[type="checkbox"][value*="All"]',
      // Checkbox dentro do container com texto "Todos"
      'label:has-text("(Todos os Valores de Colunas)") >> input[type="checkbox"]',
      'label:has-text("Todos os Valores") >> input[type="checkbox"]',
      // Primeira checkbox (geralmente é a de "Todos")
      'div.DropDownValueList >> input[type="checkbox"] >> nth=0',
      '.masterMenu input[type="checkbox"] >> nth=0',
      // Por estrutura
      'td:has-text("(Todos os Valores de Colunas)") >> input[type="checkbox"]',
      'span:has-text("(Todos os Valores de Colunas)") >> xpath=../.. >> input[type="checkbox"]'
    ];
    
    let checkboxFound = false;
    
    for (const selector of checkboxSelectors) {
      try {
        const checkbox = await page.waitForSelector(selector, { 
          timeout: CONFIG.fastMode ? 1000 : 2000,
          state: 'visible'
        });
        
        if (checkbox) {
          // Verificar se já está marcado
          const isChecked = await checkbox.isChecked();
          
          if (!isChecked) {
            await checkbox.click();
            console.log(`   ☑️ Checkbox "Todos os Valores" marcada`);
          } else {
            console.log(`   ✅ Checkbox já estava marcada`);
          }
          
          checkboxFound = true;
          break;
        }
      } catch {
        // Tentar próximo seletor
      }
    }
    
    if (!checkboxFound) {
      console.log(`   ⚠️ Checkbox não encontrada, tentando alternativas...`);
      
      // Alternativa 1: Clicar diretamente no texto
      try {
        const todosText = await page.waitForSelector('text="(Todos os Valores de Colunas)"', {
          timeout: CONFIG.fastMode ? 1000 : 2000
        });
        if (todosText) {
          await todosText.click();
          console.log(`   ✅ Clicado no texto "Todos os Valores"`);
          checkboxFound = true;
        }
      } catch {}
      
      // Alternativa 2: Desmarcar todas as outras opções
      if (!checkboxFound) {
        console.log(`   🔄 Desmarcando outras opções...`);
        const allCheckboxes = await page.$$('div.DropDownValueList input[type="checkbox"]:checked');
        
        // Desmarcar todas exceto a primeira
        for (let i = 1; i < allCheckboxes.length; i++) {
          await allCheckboxes[i].click();
          if (!CONFIG.fastMode) {
            await page.waitForTimeout(100);
          }
        }
        
        // Garantir que a primeira está marcada
        if (allCheckboxes.length > 0) {
          const firstChecked = await allCheckboxes[0].isChecked();
          if (!firstChecked) {
            await allCheckboxes[0].click();
          }
          console.log(`   ✅ Configurado para primeira opção (geralmente "Todos")`)
        }
      }
    }
    
    // Fechar dropdown - IMPORTANTE: não usar ESC pois cancela a seleção
    await page.waitForTimeout(CONFIG.fastMode ? 200 : 500);
    
    // Estratégias para fechar mantendo a seleção:
    
    // 1. Tentar clicar em botão OK/Aplicar se houver
    const confirmButtons = await page.$$('button:has-text("OK"), input[value="OK"], button:has-text("Aplicar"), a:has-text("OK")');
    if (confirmButtons.length > 0) {
      await confirmButtons[0].click();
      console.log(`   ✅ Botão OK/Aplicar clicado`);
    } else {
      // 2. Clicar no próprio ícone novamente para fechar
      try {
        await icon.click();
        console.log(`   ✅ Dropdown fechado (clique no ícone)`);
      } catch {
        // 3. Clicar fora do dropdown (não usar ESC!)
        await page.click('body', { position: { x: 100, y: 100 } });
        console.log(`   ✅ Dropdown fechado (clique fora)`);
      }
    }
    
    // Aguardar dropdown fechar completamente
    await page.waitForTimeout(CONFIG.fastMode ? 300 : 1000);
    
    // Verificar se o dropdown realmente fechou
    try {
      await page.waitForSelector('div.DropDownValueList', {
        state: 'hidden',
        timeout: CONFIG.fastMode ? 1000 : 2000
      });
    } catch {
      // Forçar fechamento se ainda estiver aberto
      await page.click('body', { position: { x: 100, y: 100 } });
      await page.waitForTimeout(CONFIG.fastMode ? 200 : 500);
    }
    
    // Verificar valor final
    const finalValue = await input.inputValue();
    console.log(`   Valor final: "${finalValue}"`);
    
    const hasAllValues = finalValue.includes('Todos os Valores') || finalValue.includes('(Todos os Valores de Colunas)');
    
    return { success: true, hasAllValues };
    
  } catch (error) {
    console.log(`   ❌ Erro: ${error.message}`);
    return { success: false, hasAllValues: false };
  }
}

/**
 * Função principal
 */
async function downloadCSV() {
  console.log('🚀 Iniciando automação do Catálogo de Escolas INEP...');
  console.log(`⚙️ Modo: ${CONFIG.headless ? 'Headless (rápido)' : 'Com interface'} | Debug: ${CONFIG.debugMode ? 'Sim' : 'Não'} | Fast: ${CONFIG.fastMode ? 'Sim' : 'Não'}\n`);
  
  ensureDownloadDir();
  
  const browser = await chromium.launch({
    headless: CONFIG.headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1920, height: 1080 },
      locale: 'pt-BR'
    });
    
    const page = await context.newPage();
    page.setDefaultTimeout(CONFIG.timeout);
    
    console.log(`📍 Navegando para a página...\n`);
    await page.goto(CONFIG.url, { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });
    
    // Aguardar elementos carregarem
    console.log('⏳ Aguardando carregamento completo...');
    await page.waitForSelector('input[id^="saw_"]', { 
      state: 'visible',
      timeout: 30000 
    });
    await page.waitForTimeout(CONFIG.fastMode ? 1000 : 3000);
    
    console.log('✅ Página carregada\n');
    
    await takeDebugScreenshot(page, '1_inicial');
    
    // Verificar título
    const title = await page.title();
    console.log(`📄 Título: ${title}\n`);
    
    // Detectar campos com dropdown
    const dropdownFields = await detectDropdownFields(page);
    
    if (dropdownFields.length === 0) {
      console.log('❌ Nenhum campo com dropdown encontrado!');
      return null;
    }
    
    console.log(`\n📊 Total de campos com dropdown: ${dropdownFields.length}`);
    
    // Validar se encontramos os campos obrigatórios
    const foundRequiredFields = [];
    const missingRequiredFields = [];
    
    for (const requiredField of REQUIRED_DROPDOWN_FIELDS) {
      const found = dropdownFields.find(field => 
        field.label && field.label.includes(requiredField)
      );
      if (found) {
        foundRequiredFields.push(found);
        console.log(`✅ Campo obrigatório encontrado: ${requiredField} -> ${found.label}`);
      } else {
        missingRequiredFields.push(requiredField);
        console.log(`❌ Campo obrigatório NÃO encontrado: ${requiredField}`);
      }
    }
    
    console.log(`\n📊 Campos obrigatórios: ${foundRequiredFields.length}/${REQUIRED_DROPDOWN_FIELDS.length} encontrados`);
    
    if (missingRequiredFields.length > 0) {
      console.log('⚠️ Campos faltando:', missingRequiredFields.join(', '));
      console.log('🔄 Tentando configurar todos os dropdowns encontrados...\n');
    }
    
    console.log('🔧 Configurando filtros para "Todos os Valores"...\n');
    
    // Configurar cada dropdown
    let configuredCount = 0;
    let configuredRequiredCount = 0;
    let skippedCount = 0;
    const configuredFields = []; // Track configured fields for dependency checking
    
    for (const field of dropdownFields) {
      // Verificar dependências antes de tentar configurar
      const dependencyCheck = shouldSkipFieldDueToDependency(field, configuredFields);
      
      if (dependencyCheck.skip) {
        console.log(`\n📝 Configurando: ${field.label}`);
        console.log(`   ⏭️ Pulando campo: ${dependencyCheck.reason}`);
        skippedCount++;
        continue;
      }
      
      const result = await configureDropdownCheckbox(page, field);
      
      if (result.success) {
        configuredCount++;
        
        // Adicionar ao tracking de campos configurados
        configuredFields.push({
          label: field.label,
          hasAllValues: result.hasAllValues
        });
        
        // Se configurou um campo com "Todas", aguardar a página atualizar os campos dependentes
        if (result.hasAllValues && (field.label.includes('Região') || field.label.includes('UF'))) {
          console.log(`   ⏳ Aguardando atualização de campos dependentes...`);
          await page.waitForTimeout(CONFIG.fastMode ? 2000 : 4000);
          
          // Se for Região, re-detectar campos pois podem ter mudado
          if (field.label.includes('Região')) {
            console.log(`   🔄 Re-escaneando campos após configurar Região...`);
            await page.waitForTimeout(500);
          }
        }
        
        // Verificar se é um campo obrigatório
        const isRequired = REQUIRED_DROPDOWN_FIELDS.some(req => 
          field.label && field.label.includes(req)
        );
        if (isRequired) {
          configuredRequiredCount++;
        }
      } else if (result.reason === 'hidden' || result.reason === 'disabled') {
        console.log(`   ℹ️ Campo indisponível (provavelmente devido à seleção hierárquica anterior)`);
        skippedCount++;
      }
      
      // Pequena pausa entre configurações (apenas se não for modo rápido)
      if (!CONFIG.fastMode) {
        await page.waitForTimeout(300);
      }
    }
    
    console.log(`\n✅ ${configuredCount}/${dropdownFields.length} campos configurados`);
    console.log(`✅ ${configuredRequiredCount}/${REQUIRED_DROPDOWN_FIELDS.length} campos obrigatórios configurados`);
    if (skippedCount > 0) {
      console.log(`ℹ️ ${skippedCount} campos pulados por dependência hierárquica`);
    }
    console.log();
    
    // Limpar campos de texto (Nome e Código da Escola)
    console.log('📝 Verificando campos de texto...');
    
    // Buscar campos de texto que NÃO têm dropdown - busca novamente devido a mudanças na página
    try {
      const textInputs = await page.$$('input[id^="saw_"][type="text"]');
      
      for (const input of textInputs) {
        try {
          // Verificar se o elemento ainda está anexado ao DOM
          const isAttached = await input.evaluate(el => el.isConnected);
          if (!isAttached) {
            continue;
          }
          
          const inputId = await input.getAttribute('id');
          
          // Verificar se este campo NÃO tem dropdown
          const hasDropdown = dropdownFields.some(f => f.inputId === inputId);
          
          if (!hasDropdown) {
            // Verificar se está visível e habilitado
            const isVisible = await input.isVisible();
            const isEnabled = await input.isEnabled();
            
            if (isVisible && isEnabled) {
              // É um campo de texto livre (provavelmente Nome ou Código)
              const value = await input.inputValue();
              if (value) {
                await input.fill('');
                console.log(`   ✅ Campo #${inputId} limpo (texto livre)`);
              }
            } else {
              console.log(`   ⚠️ Campo #${inputId} não está acessível (pode ter sido desabilitado)`);
            }
          }
        } catch (fieldError) {
          console.log(`   ⚠️ Erro ao processar campo: ${fieldError.message}`);
        }
      }
    } catch (error) {
      console.log(`   ⚠️ Erro ao buscar campos de texto: ${error.message}`);
      console.log('   ℹ️ Continuando sem limpar campos de texto...');
    }
    
    console.log('\n✅ Filtros configurados\n');
    await takeDebugScreenshot(page, '2_filtros_configurados');
    
    // Aplicar filtros
    console.log('🔍 Procurando botão Aplicar...');
    
    const applyButtonSelectors = [
      'input[value="Aplicar"]',
      'a:has-text("Aplicar")',
      'button:has-text("Aplicar")',
      'td.PTButton >> a >> text="Aplicar"',
      'a.PTButton:has-text("Aplicar")',
      '#gobtn',
      '.promptApplyButton',
      // Seletores mais genéricos para capturar link sem ID
      'a:text-is("Aplicar")',
      'a[onclick*="apply"]',
      'a[href*="apply"]'
    ];
    
    let buttonFound = false;
    for (const selector of applyButtonSelectors) {
      try {
        const button = await page.waitForSelector(selector, { 
          timeout: CONFIG.fastMode ? 2000 : 3000,
          state: 'visible' 
        });
        if (button) {
          await button.scrollIntoViewIfNeeded();
          await button.click();
          console.log(`   ✅ Botão Aplicar clicado`);
          buttonFound = true;
          break;
        }
      } catch {
        // Tentar próximo seletor
      }
    }
    
    if (!buttonFound) {
      console.log('   ⚠️ Botão Aplicar não encontrado com seletores, tentando busca manual...');
      
      // Busca manual por todos os links com texto "Aplicar"
      try {
        const allLinks = await page.$$('a');
        for (const link of allLinks) {
          const text = await link.textContent();
          if (text && text.trim() === 'Aplicar') {
            const isVisible = await link.isVisible();
            if (isVisible) {
              await link.scrollIntoViewIfNeeded();
              await link.click();
              console.log(`   ✅ Botão Aplicar encontrado e clicado (busca manual)`);
              buttonFound = true;
              break;
            }
          }
        }
      } catch (error) {
        console.log(`   ❌ Erro na busca manual: ${error.message}`);
      }
      
      if (!buttonFound) {
        // Listar todos os links/botões visíveis para debug
        const visibleButtons = await page.$$eval('a, button, input[type="button"], input[type="submit"]', 
          elements => elements
            .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0)
            .slice(0, 10)
            .map(el => ({
              tag: el.tagName,
              text: el.textContent?.trim() || el.value,
              id: el.id,
              class: el.className
            }))
        );
        
        console.log('\n   🔍 Botões/Links visíveis:');
        visibleButtons.forEach(btn => {
          if (btn.text) {
            console.log(`      - ${btn.tag}: "${btn.text}" (id: ${btn.id || 'sem id'})`);
          }
        });
      }
    }
    
    // Aguardar processamento
    console.log('\n⏳ Aguardando processamento...');
    await page.waitForTimeout(CONFIG.fastMode ? 5000 : 10000);
    
    await takeDebugScreenshot(page, '3_apos_aplicar');
    
    // Verificar resultados
    try {
      const bodyText = await page.textContent('body');
      const match = bodyText.match(/Foram selecionadas[^0-9]*([0-9.]+)[^0-9]*escolas/);
      if (match) {
        console.log(`\n📊 ${match[0]}\n`);
      }
    } catch {}
    
    // Procurar link de exportação
    console.log('💾 Procurando opção de exportação...');
    
    const exportSelectors = [
      // Seletores específicos para o botão encontrado
      'a[onclick*="Download("]',
      'a[onclick*="Format=csv"]',
      'a[onclick*="Extension=.csv"]',
      'a:has-text("Exportar")',
      'a[onclick*="NQWClearActiveMenu"]',
      // Seletores genéricos
      'a:has-text("Export")',
      'button:has-text("Exportar")',
      'a[title*="Export"]',
      'td.PTButton >> a >> text=/Export/',
      'a:has-text("Download")',
      'a[onclick*="export"]',
      'a[onclick*="Export"]'
    ];
    
    let exportFound = false;
    for (const selector of exportSelectors) {
      try {
        const exportElement = await page.waitForSelector(selector, {
          timeout: CONFIG.fastMode ? 2000 : 3000,
          state: 'visible'
        });
        
        if (exportElement) {
          console.log(`   ✅ Link de exportação encontrado`);
          
          // Configurar para detectar download
          const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
          
          await exportElement.scrollIntoViewIfNeeded();
          await exportElement.click();
          console.log('   ⏳ Aguardando download...');
          
          const download = await downloadPromise;
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
          const fileName = `catalogo_escolas_${timestamp}.csv`;
          const savePath = path.join(CONFIG.downloadPath, fileName);
          
          await download.saveAs(savePath);
          console.log(`\n✅ Download concluído!`);
          console.log(`📁 Arquivo: ${savePath}`);
          
          const stats = fs.statSync(savePath);
          const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
          console.log(`📊 Tamanho: ${fileSizeInMB} MB`);
          
          exportFound = true;
          return savePath;
        }
      } catch {
        // Tentar próximo seletor
      }
    }
    
    if (!exportFound) {
      console.log('   ⚠️ Link de exportação não encontrado com seletores, tentando busca manual...');
      
      // Busca manual por links com onclick contendo Download e CSV
      try {
        const allLinks = await page.$$('a');
        for (const link of allLinks) {
          const onclick = await link.getAttribute('onclick');
          const text = await link.textContent();
          
          if ((onclick && onclick.includes('Download(') && onclick.includes('csv')) ||
              (text && text.trim() === 'Exportar')) {
            const isVisible = await link.isVisible();
            if (isVisible) {
              console.log(`   ✅ Link de exportação encontrado (busca manual)`);
              console.log(`      Texto: "${text}"`);
              console.log(`      Onclick: ${onclick ? 'Sim (Download + CSV)' : 'Não'}`);
              
              // Configurar para detectar download
              const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
              
              await link.scrollIntoViewIfNeeded();
              await link.click();
              console.log('   ⏳ Aguardando download...');
              
              const download = await downloadPromise;
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
              const fileName = `catalogo_escolas_${timestamp}.csv`;
              const savePath = path.join(CONFIG.downloadPath, fileName);
              
              await download.saveAs(savePath);
              console.log(`\n✅ Download concluído!`);
              console.log(`📁 Arquivo: ${savePath}`);
              
              const stats = fs.statSync(savePath);
              const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
              console.log(`📊 Tamanho: ${fileSizeInMB} MB`);
              
              exportFound = true;
              return savePath;
            }
          }
        }
      } catch (error) {
        console.log(`   ❌ Erro na busca manual: ${error.message}`);
      }
      
      if (!exportFound) {
        console.log('   ⚠️ Link de exportação não encontrado');
        console.log('\n   💡 Dicas:');
        console.log('   - Verifique se os filtros foram aplicados corretamente');
        console.log('   - Pode ser necessário aguardar mais tempo');
        console.log('   - O link pode aparecer após os resultados carregarem');
        
        await takeDebugScreenshot(page, '4_final');
      }
    }
    
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    
    // Tentar tirar screenshot apenas se page estiver definida
    try {
      if (typeof page !== 'undefined' && page) {
        await takeDebugScreenshot(page, 'erro');
      }
    } catch (screenshotError) {
      console.log('   ⚠️ Não foi possível capturar screenshot do erro');
    }
    
    throw error;
  } finally {
    if (!CONFIG.headless) {
      console.log('\n⏸️ Browser aberto para debug. Feche manualmente quando terminar.');
      console.log('📌 Pressione Ctrl+C para encerrar o script.');
    } else {
      await browser.close();
    }
  }
}

// Execução
if (require.main === module) {
  downloadCSV()
    .then(filePath => {
      if (filePath) {
        console.log('\n✨ Download realizado com sucesso!');
      } else {
        console.log('\n⚠️ Download não foi concluído');
      }
    })
    .catch(error => {
      console.error('\n💥 Erro fatal:', error.message);
      process.exit(1);
    });
}

module.exports = { downloadCSV };