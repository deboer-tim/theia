/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { StorageService } from '@theia/core/lib/browser/storage-service';
import { WorkspaceService } from './workspace-service';
import { inject, injectable } from 'inversify';

/*
 * Prefixes any stored data with the current workspace path.
 */
@injectable()
export class WorkspaceStorageService implements StorageService {

    constructor( @inject(WorkspaceService) protected workspaceService: WorkspaceService,
        @inject(StorageService) protected storageService: StorageService) { }

    async setData<T>(key: string, data: T): Promise<void> {
        const fullKey = await this.getKey(key);
        return this.storageService.setData(fullKey, data);
    }

    async getData<T>(key: string, defaultValue: T): Promise<T> {
        const fullKey = await this.getKey(key);
        return this.storageService.getData(fullKey, defaultValue);
    }

    protected async getKey(originalKey: string): Promise<string> {
        const fileStat = await this.workspaceService.root;
        return fileStat.uri + ":" + originalKey;
    }
}
