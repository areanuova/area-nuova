import type { NavigationAction } from './types';
import { ROUTES } from './routes';

export function navAction(routeKey: keyof typeof ROUTES): NavigationAction {
  const route = ROUTES[routeKey];
  return {
    type:  route.external ? 'external-link' : 'navigate',
    label: `Vai a ${route.label}`,
    url:   route.path,
  };
}

export function filterAction(
  routeKey: keyof typeof ROUTES,
  label: string,
  filters: Record<string, string>,
): NavigationAction {
  const route = ROUTES[routeKey];
  return {
    type:    'open-filter',
    label,
    url:     route.path,
    filters,
  };
}

export function searchAction(
  routeKey: keyof typeof ROUTES,
  label: string,
  query: string,
): NavigationAction {
  const route = ROUTES[routeKey];
  return {
    type:  'search',
    label,
    url:   route.path,
    query,
  };
}

export function copyAction(label: string, value: string): NavigationAction {
  return { type: 'copy', label, value };
}
