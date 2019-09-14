import * as React from 'react';

import { ipcRenderer, remote } from 'electron';
import { observable, computed } from 'mobx';
import { lightTheme } from '~/renderer/constants';
import { DEFAULT_SEARCH_ENGINES } from '~/constants';
import {
  ISearchEngine,
  IHistoryItem,
  IFavicon,
  ISuggestion,
} from '~/interfaces';
import { Database } from '~/models/database';
import { SuggestionsStore } from './suggestions';

let lastSuggestion: string;

interface ISearchTab {
  id?: number;
  title?: string;
  url?: string;
  favicon?: string;
}

export class Store {
  public suggestions = new SuggestionsStore(this);

  @observable
  public theme = lightTheme;

  @observable
  public visible = true;

  @observable
  public searchEngines: ISearchEngine[] = DEFAULT_SEARCH_ENGINES;

  @observable
  public history: IHistoryItem[] = [];

  @observable
  public favicons: Map<string, string> = new Map();

  @observable
  public tabs: ISearchTab[] = [];

  @observable
  public inputText = '';

  @computed
  public get searchedTabs(): ISuggestion[] {
    const lastItem = this.suggestions.list[this.suggestions.list.length - 1];

    let id = 0;

    if (lastItem) {
      id = lastItem.id + 1;
    }

    return this.tabs
      .filter(
        tab =>
          tab.title.indexOf(this.inputText) !== -1 ||
          tab.url.indexOf(this.inputText) !== -1,
      )
      .map(tab => ({
        primaryText: tab.url,
        secondaryText: tab.title,
        id: id++,
        favicon: tab.favicon,
      }))
      .slice(0, 3);
  }

  @computed
  public get searchEngine() {
    return this.searchEngines[0];
  }

  public canSuggest = false;

  public historyDb = new Database<IHistoryItem>('history');
  public faviconsDb = new Database<IFavicon>('favicons');

  public id = remote.getCurrentWebContents().id;

  public inputRef = React.createRef<HTMLInputElement>();

  public tabId = 1;

  public constructor() {
    ipcRenderer.on('visible', (e, flag, tab) => {
      this.visible = flag;

      if (flag) {
        this.loadHistory();
        this.loadFavicons();
        this.tabs = [];
        this.suggestions.list = [];
        this.tabId = tab.id;
        this.inputRef.current.value = tab.url;
        this.inputRef.current.focus();
      }
    });

    ipcRenderer.on('search-tabs', (e, tabs) => {
      this.tabs = tabs;
    });

    this.loadHistory();
    this.loadFavicons();

    setTimeout(() => {
      this.visible = false;
    });

    window.addEventListener('blur', () => {
      if (this.visible) {
        ipcRenderer.send(`hide-${this.id}`);
      }
    });
  }

  public async loadFavicons() {
    (await this.faviconsDb.get({})).forEach(favicon => {
      const { data } = favicon;

      if (this.favicons.get(favicon.url) == null) {
        this.favicons.set(favicon.url, data);
      }
    });
  }

  public async loadHistory() {
    const items = await this.historyDb.get({});

    items.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    this.history = items;
  }

  public suggest() {
    const { suggestions } = this;
    const input = this.inputRef.current;

    if (this.canSuggest) {
      this.autoComplete(input.value, lastSuggestion);
    }

    suggestions.load(input).then(suggestion => {
      lastSuggestion = suggestion;
      if (this.canSuggest) {
        this.autoComplete(
          input.value.substring(0, input.selectionStart),
          suggestion,
        );
        this.canSuggest = false;
      }
    });

    suggestions.selected = 0;
  }

  public autoComplete(text: string, suggestion: string) {
    const regex = /(http(s?)):\/\/(www.)?|www./gi;
    const regex2 = /(http(s?)):\/\//gi;

    const start = text.length;

    const input = this.inputRef.current;

    if (input.selectionStart !== input.value.length) return;

    if (suggestion) {
      if (suggestion.startsWith(text.replace(regex, ''))) {
        input.value = text + suggestion.replace(text.replace(regex, ''), '');
      } else if (`www.${suggestion}`.startsWith(text.replace(regex2, ''))) {
        input.value =
          text + `www.${suggestion}`.replace(text.replace(regex2, ''), '');
      }
      input.setSelectionRange(start, input.value.length);
    }
  }
}

export default new Store();
