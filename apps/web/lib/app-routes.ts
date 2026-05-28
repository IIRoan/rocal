export const HOME_PATH = "/home";
export const CALENDAR_HOME_PATH = "/calendar";
export const MAIL_HOME_PATH = "/mail";

export type RouteSearchParamValue = string | string[] | null | undefined;
export type RouteSearchParams = Record<string, RouteSearchParamValue>;

type RouteSearchParamsInput =
  | RouteSearchParams
  | URLSearchParams
  | null
  | undefined;

function appendSearchParam(
  params: URLSearchParams,
  key: string,
  value: RouteSearchParamValue,
): void {
  if (value == null) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => appendSearchParam(params, key, entry));
    return;
  }

  params.append(key, value);
}

export function buildPathWithSearch(
  path: string,
  searchParams?: RouteSearchParamsInput,
): string {
  const params =
    searchParams instanceof URLSearchParams
      ? new URLSearchParams(searchParams)
      : new URLSearchParams();

  if (searchParams && !(searchParams instanceof URLSearchParams)) {
    Object.entries(searchParams).forEach(([key, value]) => {
      appendSearchParam(params, key, value);
    });
  }

  const query = params.toString();

  return query ? `${path}?${query}` : path;
}

export function buildCalendarPath(
  searchParams?: RouteSearchParamsInput,
): string {
  return buildPathWithSearch(CALENDAR_HOME_PATH, searchParams);
}
