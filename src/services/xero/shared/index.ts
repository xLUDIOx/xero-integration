export type IQuery = { [key: string]: any };

export function toUrlParams(query?: IQuery): string {
    const queryString = query ? Object.keys(query)
        .filter(x => query[x] !== undefined)
        .map(x => `${x}=${encodeURIComponent(query[x].toString())}`).join('&') :
        '';
    return queryString;
}

export function buildUrl(basePath: string, path: string, query?: IQuery): string {
    const queryString = toUrlParams(query);
    return `${basePath}${path}${queryString.length > 0 ? `?${queryString}` : ''}`;
}
