const cron = require('node-cron');
const { downloadInepData } = require('./scraper');
const schoolService = require('./schools');
const fileManager = require('./fileManager');
const config = require('../config');

class Scheduler {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.nextRun = null;
  }

  start() {
    if (!this.shouldEnableScheduler()) {
      console.log('📅 Scheduler diário desabilitado');
      return;
    }

    console.log('📅 Scheduler ativado - Download diário às 00:00');
    
    this.scheduledTask = cron.schedule('0 0 * * *', async () => {
      await this.runDailyUpdate();
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    });

    this.updateNextRunTime();
  }

  shouldEnableScheduler() {
    return process.env.DAILY_DOWNLOAD !== 'false';
  }

  async runDailyUpdate() {
    if (this.isRunning) {
      console.log('⏳ Atualização já em andamento, ignorando...');
      return;
    }

    console.log('🔄 Iniciando atualização automática diária...');
    this.isRunning = true;
    this.lastRun = new Date();

    try {
      console.log('1/4 📦 Fazendo backup do arquivo atual...');
      fileManager.backupCurrentFile();

      console.log('2/4 ⬇️ Baixando novo catálogo...');
      const tempFilePath = await downloadInepData();

      console.log('3/4 💾 Salvando como arquivo atual...');
      const currentFilePath = fileManager.saveAsCurrentFile(tempFilePath);

      console.log('4/4 🔄 Recarregando dados na aplicação...');
      await schoolService.loadFromFile(currentFilePath);

      console.log('🧹 Limpando arquivos antigos...');
      fileManager.cleanupOldFiles();

      console.log('✅ Atualização automática concluída com sucesso');
    } catch (error) {
      console.error('❌ Erro na atualização automática:', error.message);
    } finally {
      this.isRunning = false;
      this.updateNextRunTime();
    }
  }

  async runManualUpdate() {
    console.log('🔄 Atualização manual solicitada...');
    await this.runDailyUpdate();
  }

  updateNextRunTime() {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(0, 0, 0, 0);
    
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    
    this.nextRun = nextRun;
  }

  getStatus() {
    return {
      enabled: this.shouldEnableScheduler(),
      running: this.isRunning,
      lastRun: this.lastRun,
      nextRun: this.nextRun,
      schedule: '00:00 (diário)'
    };
  }

  stop() {
    if (this.scheduledTask) {
      this.scheduledTask.destroy();
      console.log('📅 Scheduler parado');
    }
  }
}

module.exports = new Scheduler();