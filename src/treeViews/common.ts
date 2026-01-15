import {
  commands,
  Disposable,
  EventEmitter,
  type ExtensionContext,
  type TreeDataProvider,
  type TreeView,
  type TreeViewOptions,
  window,
} from 'vscode'

export enum ViewTypes {
  post = 'hexo.post',
  draft = 'hexo.draft',
  categories = 'hexo.categories',
  tags = 'hexo.tags',
  toc = 'hexo.toc',
}

export class BaseDispose implements Disposable {
  private _disposable?: Disposable

  subscribe(...disposables: Disposable[]) {
    if (this._disposable) {
      this._disposable = Disposable.from(this._disposable, ...disposables)
    } else {
      this._disposable = Disposable.from(...disposables)
    }
  }

  dispose() {
    this._disposable?.dispose()
  }
}

export abstract class BaseTreeView<T> extends BaseDispose {
  treeView: TreeView<T>

  constructor(id: string, provider: TreeDataProvider<T>, opts: Partial<TreeViewOptions<T>>) {
    super()
    this.treeView = window.createTreeView(id, {
      canSelectMany: true,
      treeDataProvider: provider,
      ...opts,
    })
    this.subscribe(this.treeView)
  }
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
const treeViews: any[] = []

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
const instances: BaseTreeView<any>[] = []

const onSidebarVisibilityChangeEmitter = new EventEmitter<boolean>()

export const onSidebarVisibilityChange = onSidebarVisibilityChangeEmitter.event

export function isHexoSidebarActive() {
  return instances.some((v) => v.treeView.visible)
}

export function treeView(): ClassDecorator {
  return (target) => {
    treeViews.push(target)
  }
}

export function registerTreeViews(context: ExtensionContext) {
  for (const TreeViewClass of treeViews) {
    const instance = new TreeViewClass(context)
    instances.push(instance)
    context.subscriptions.push(instance)

    instance.treeView.onDidChangeVisibility(() => {
      const active = isHexoSidebarActive()
      commands.executeCommand('setContext', 'isHexoSidebarActive', active)
      onSidebarVisibilityChangeEmitter.fire(active)
    })
  }

  // Set initial context value
  commands.executeCommand('setContext', 'isHexoSidebarActive', isHexoSidebarActive())
}
