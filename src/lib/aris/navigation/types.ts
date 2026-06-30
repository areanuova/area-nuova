export type NavigationActionType =
  | 'navigate'
  | 'open-filter'
  | 'open-page'
  | 'external-link'
  | 'scroll'
  | 'copy'
  | 'search';

export interface NavigationAction {
  type:     NavigationActionType;
  label:    string;
  url?:     string;
  filters?: Record<string, string>;
  query?:   string;
  value?:   string;
}
