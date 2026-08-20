'use strict';

const config = require('./config');

const commands = [];

function escapeRegex(str) {
  return String(str).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function buildHandlerPrefix(rawHandlers, allowNoPrefix) {
  if (rawHandlers === 'false' || rawHandlers === '^' || rawHandlers === '' || rawHandlers == null) {
    return '^(?:[.,!/#])?';
  }

  const handlersStr = String(rawHandlers);
  const parts = Array.from(handlersStr)
    .map((h) => escapeRegex(h))
    .filter(Boolean);

  if (parts.length === 0) {
    return '^(?:[.,!/#])?';
  }

  const group = `^(?:${parts.join('|')})`;
  return allowNoPrefix ? `${group}?` : group;
}

function Module(info, func) {
  const handlerPrefix = buildHandlerPrefix(config.HANDLERS, Boolean(config.MULTI_HANDLERS));

  const commandInfo = {
    fromMe: info.fromMe ?? (config.MODE === 'private'),
    desc: info.desc ?? '',
    usage: info.usage ?? '',
    excludeFromCommands: info.excludeFromCommands ?? false,
    warn: info.warn ?? '',
    use: info.use ?? 'general',
    function: func
  };

  if (info.on === undefined && info.pattern === undefined) {
    commandInfo.on = 'message';
    commandInfo.fromMe = false;
  } else if (info.on !== undefined) {
    commandInfo.on = info.on;
    if (info.pattern !== undefined) {
      const prefix = (info.handler ?? true) ? handlerPrefix : '';
      commandInfo.pattern = new RegExp(`${prefix}${info.pattern}`, 'si');
    }
  } else if (info.pattern !== undefined) {
    const prefix = (info.handler ?? true) ? handlerPrefix : '';
    commandInfo.pattern = new RegExp(`${prefix}${info.pattern}`, 'si');
  }

  commands.push(commandInfo);
  return commandInfo;
}

module.exports = {
  Module,
  addCommand: Module,
  commands
};
