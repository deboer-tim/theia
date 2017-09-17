/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import URI from "@theia/core/lib/common/uri";
import { Emitter, Event, RecursivePartial, SelectionService } from '@theia/core/lib/common';
import { OpenHandler, FrontendApplication } from "@theia/core/lib/browser";
import { EditorWidget } from "./editor-widget";
import { EditorRegistry } from "./editor-registry";
import { TextEditorProvider, Range, Position } from "./editor";
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { WorkspaceStorageService } from '@theia/workspace/lib/browser/workspace-storage-service';

export const EditorManager = Symbol("EditorManager");

export interface EditorManager extends OpenHandler {
    /**
     * All opened editors.
     */
    readonly editors: EditorWidget[];
    /**
     * Emit when editors changed.
     */
    readonly onEditorsChanged: Event<void>;
    /**
     * Open an editor for the given uri and input.
     * Reject if the given input is not an editor input or an editor cannot be opened.
     */
    open(uri: URI, input?: EditorInput): Promise<EditorWidget>;
    /**
     * The most recently focused editor.
     */
    readonly currentEditor: EditorWidget | undefined;
    /**
     * Emit when the current editor changed.
     */
    readonly onCurrentEditorChanged: Event<EditorWidget | undefined>;
    /**
     * The currently focused editor.
     */
    readonly activeEditor: EditorWidget | undefined;
    /**
     * Emit when the active editor changed.
     */
    readonly onActiveEditorChanged: Event<EditorWidget | undefined>;
}

export interface EditorInput {
    revealIfVisible?: boolean;
    selection?: RecursivePartial<Range>;
}

namespace editorStorage {
    export const openedEditors = 'editorStorage.openedEditors';
    export const activeEditor = 'editorStorage.activeEditor';
}

@injectable()
export class EditorManagerImpl implements EditorManager {

    readonly id = "code-editor-opener";
    readonly label = "Code Editor";

    protected readonly currentObserver: EditorManagerImpl.Observer;
    protected readonly activeObserver: EditorManagerImpl.Observer;

    constructor(
        @inject(EditorRegistry) protected readonly editorRegistry: EditorRegistry,
        @inject(TextEditorProvider) protected readonly editorProvider: TextEditorProvider,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        @inject(WorkspaceStorageService) protected readonly storageService: StorageService
    ) {
        this.currentObserver = new EditorManagerImpl.Observer('current', app);
        this.activeObserver = new EditorManagerImpl.Observer('active', app);

        this.onActiveEditorChanged(e => {
            this.storageService.setData(editorStorage.activeEditor, e ? e.editor.uri.toString() : undefined);
        });
        this.restorePreviousState();
    }

    protected restorePreviousState(): void {
        // we cannot do this during injection, as it will trigger cycles
        setTimeout(async () => {
            const openedEditors: string[] = await this.storageService.getData(editorStorage.openedEditors, []);
            const activeEditor = await this.storageService.getData(editorStorage.activeEditor, undefined);
            const promises: Promise<EditorWidget>[] = [];
            for (const uri of openedEditors) {
                promises.push(this.open(new URI(uri)));
            }
            if (activeEditor) {
                Promise.all(promises).then(editors => {
                    for (const editor of editors) {
                        if (editor.editor.uri.toString() === activeEditor) {
                            this.app.shell.activateMain(editor.id);
                        }
                    }
                });
            }
        });
    }

    get editors() {
        return this.editorRegistry.getOpenedEditors();
    }

    get onEditorsChanged() {
        return this.editorRegistry.onEditorsChanged();
    }

    get currentEditor() {
        return this.currentObserver.getEditor();
    }

    get onCurrentEditorChanged() {
        return this.currentObserver.onEditorChanged();
    }

    get activeEditor() {
        return this.activeObserver.getEditor();
    }

    get onActiveEditorChanged() {
        return this.activeObserver.onEditorChanged();
    }

    canHandle(uri: URI, input?: EditorInput): number {
        return 100;
    }

    open(uri: URI, input?: EditorInput): Promise<EditorWidget> {
        return this.getOrCreateEditor(uri).then(editor => {
            this.revealIfVisible(editor, input);
            this.revealSelection(editor, input);
            return editor;
        });
    }

    protected getOrCreateEditor(uri: URI): Promise<EditorWidget> {
        const editor = this.editorRegistry.getEditor(uri);
        if (editor) {
            return editor;
        }
        return this.editorProvider(uri).then(textEditor => {
            const newEditor = new EditorWidget(textEditor, this.selectionService);
            newEditor.title.closable = true;
            newEditor.title.label = uri.path.base;
            this.editorRegistry.addEditor(uri, newEditor);
            newEditor.disposed.connect(() => {

                this.editorRegistry.removeEditor(uri)
                this.updateOpenEditors(uris => {
                    const index = uris.indexOf(uri.toString());
                    if (index > -1) {
                        uris.splice(index);
                    }
                    return uris;
                });
            });
            this.updateOpenEditors(uris => {
                if (uris.indexOf(uri.toString()) === -1) {
                    uris.push(uri.toString());
                }
                return uris;
            });
            this.app.shell.addToMainArea(newEditor);
            return newEditor;
        });
    }

    protected async updateOpenEditors(update: (uris: string[]) => string[]): Promise<void> {
        const uris: string[] = await this.storageService.getData(editorStorage.openedEditors, []);
        return this.storageService.setData(editorStorage.openedEditors, update(uris));
    }

    protected revealIfVisible(editor: EditorWidget, input?: EditorInput): void {
        if (input === undefined || input.revealIfVisible === undefined || input.revealIfVisible) {
            this.app.shell.activateMain(editor.id);
        }
    }

    protected revealSelection(widget: EditorWidget, input?: EditorInput): void {
        if (input && input.selection) {
            const editor = widget.editor;
            const selection = this.getSelection(input.selection);
            if (Position.is(selection)) {
                editor.cursor = selection;
                editor.revealPosition(selection);
            } else if (Range.is(selection)) {
                editor.cursor = selection.end;
                editor.selection = selection;
                editor.revealRange(selection);
            }
        }
    }

    protected getSelection(selection: RecursivePartial<Range>): Range | Position | undefined {
        const { start, end } = selection;
        if (start && start.line !== undefined && start.line >= 0 &&
            start.character !== undefined && start.character >= 0) {
            if (end && end.line !== undefined && end.line >= 0 &&
                end.character !== undefined && end.character >= 0) {
                return selection as Range;
            }
            return start as Position;
        }
        return undefined;
    }

}

export namespace EditorManagerImpl {
    export class Observer {
        protected readonly onEditorChangedEmitter = new Emitter<EditorWidget | undefined>();

        constructor(
            protected readonly kind: 'current' | 'active',
            protected readonly app: FrontendApplication
        ) {
            const key = this.kind === 'current' ? 'currentChanged' : 'activeChanged';
            app.shell[key].connect((shell, arg) => {
                if (arg.newValue instanceof EditorWidget || arg.oldValue instanceof EditorWidget) {
                    this.onEditorChangedEmitter.fire(this.getEditor());
                }
            });
        }

        getEditor(): EditorWidget | undefined {
            if (this.app) {
                const key = this.kind === 'current' ? 'currentWidget' : 'activeWidget';
                const widget = this.app.shell[key];
                if (widget instanceof EditorWidget) {
                    return widget;
                }
            }
            return undefined;
        }

        onEditorChanged() {
            return this.onEditorChangedEmitter.event;
        }
    }
}
