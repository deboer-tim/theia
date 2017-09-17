/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from "inversify";
import { SelectionService } from "@theia/core/lib/common";
import { FrontendApplicationContribution, FrontendApplication } from "@theia/core/lib/browser";
import { FileSystem } from "@theia/filesystem/lib/common";
import { DirNode } from "@theia/filesystem/lib/browser";
import { WorkspaceService } from "@theia/workspace/lib/browser";
import { FileNavigatorWidget, FILE_NAVIGATOR_ID, navigatorStorage } from './navigator-widget';
import { StorageService } from '@theia/core/lib/browser/storage-service';

@injectable()
export class FileNavigatorContribution implements FrontendApplicationContribution {

    protected readonly onReady: Promise<void>;

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(FileNavigatorWidget) @named(FILE_NAVIGATOR_ID) protected readonly fileNavigator: FileNavigatorWidget,
        @inject(StorageService) protected storageService: StorageService
    ) {
        this.fileNavigator.model.onSelectionChanged(selection =>
            this.selectionService.selection = selection
        );
        this.onReady = this.workspaceService.root.then(fileStat => {
            this.fileNavigator.model.root = DirNode.createRoot(fileStat);
        });
    }

    onStart(app: FrontendApplication): void {
        app.shell.addToLeftArea(this.fileNavigator);
        this.storageService.getData(navigatorStorage.active, true).then(isActive => {
            if (isActive) {
                app.shell.activateLeft(FILE_NAVIGATOR_ID);
            }
        });
    }

}
