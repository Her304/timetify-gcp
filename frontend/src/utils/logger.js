// Memory storage for logs
let logs = [];
const MAX_LOGS = 200;

export const initLogger = () => {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
  };

  const addLog = (level, args) => {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    logs.push(`[${timestamp}] ${level}: ${message}`);
    if (logs.length > MAX_LOGS) {
      logs.shift();
    }
    
    // Also persist to sessionStorage so logs survive refreshes within the same tab
    sessionStorage.setItem('app_logs', JSON.stringify(logs));
  };

  // Recover logs from sessionStorage
  const savedLogs = sessionStorage.getItem('app_logs');
  if (savedLogs) {
    try {
      logs = JSON.parse(savedLogs);
    } catch (e) {
      logs = [];
    }
  }

  console.log = (...args) => {
    addLog('LOG', args);
    originalConsole.log.apply(console, args);
  };

  console.warn = (...args) => {
    addLog('WARN', args);
    originalConsole.warn.apply(console, args);
  };

  console.error = (...args) => {
    addLog('ERROR', args);
    originalConsole.error.apply(console, args);
  };

  console.info = (...args) => {
    addLog('INFO', args);
    originalConsole.info.apply(console, args);
  };
};

export const getLogs = () => {
    const savedLogs = sessionStorage.getItem('app_logs');
    if (savedLogs) {
        try {
            return JSON.parse(savedLogs).join('\n');
        } catch (e) {
            return logs.join('\n');
        }
    }
  return logs.join('\n');
};

export const clearLogs = () => {
    logs = [];
    sessionStorage.removeItem('app_logs');
};
