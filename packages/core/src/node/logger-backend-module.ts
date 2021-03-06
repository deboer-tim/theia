/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, Container } from 'inversify';
import { ConnectionHandler, JsonRpcConnectionHandler } from "../common/messaging";
import { ILogger, LoggerFactory, LoggerOptions, Logger } from '../common/logger';
import { ILoggerServer, ILoggerClient, loggerPath, LoggerServerOptions } from '../common/logger-protocol';
import { BunyanLoggerServer } from './bunyan-logger-server';
import { LoggerWatcher } from '../common/logger-watcher';
import * as yargs from 'yargs';

export const loggerBackendModule = new ContainerModule(bind => {
    bind(ILogger).to(Logger).inSingletonScope().whenTargetIsDefault();
    bind(LoggerWatcher).toSelf().inSingletonScope();
    bind(ILoggerServer).to(BunyanLoggerServer).inSingletonScope();
    bind(LoggerServerOptions).toDynamicValue(ctx => {
        let logLevel = yargs.argv.loglevel;
        if (['trace', 'debug', 'info', 'warn', 'error', 'fatal'].indexOf(logLevel) < 0) {
            logLevel = 'info';
        }
        return {
            name: "Theia",
            level: logLevel
        };
    }
    ).inSingletonScope();
    bind(LoggerFactory).toFactory(ctx =>
        (options?: any) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            child.bind(ILogger).to(Logger).inTransientScope();
            child.bind(LoggerOptions).toConstantValue(options);
            return child.get(ILogger);
        }
    );

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<ILoggerClient>(loggerPath, client => {
            const loggerServer = ctx.container.get<ILoggerServer>(ILoggerServer);
            loggerServer.setClient(client);
            return loggerServer;
        })
    ).inSingletonScope();
});

