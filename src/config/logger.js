// src/config/logger.js
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize } = format;

const myFormat = printf(({ timestamp, level, message }) => {
  return `${timestamp} [${level}]: ${message}`;
});

const logger = createLogger({
  level: 'info', // Nivel mínimo a registrar
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    myFormat
  ),
  transports: [
    // Envía los logs a la consola con colores
    new transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        myFormat
      )
    }),
    // Guarda los logs en un archivo
    new transports.File({ filename: 'logs/app.log' }),
     // Error log file for error logs only
    new transports.File({ filename: 'logs/error.log', level: 'error' })
  ],
  exitOnError: false // No finalizar la aplicación en caso de error de log
});

module.exports = logger;
