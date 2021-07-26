import * as moment from 'moment';

export const formatDate = (date: string | Date): string => {
    return moment.utc(date).format(DATE_FORMAT);
};

/**
 * @dateTicks Format like /Date()/
 */
export const fromDateTicks = (dateTicks?: string): Date | undefined => {
    const prefix = '/Date(';
    const suffix = ')/';

    if (!dateTicks) {
        return undefined;
    }

    if (!dateTicks.startsWith(prefix) || !dateTicks.endsWith(suffix)) {
        return undefined;
    }

    const ticksString = dateTicks.substring(prefix.length, dateTicks.length - suffix.length);
    const ticksParts = ticksString.split('+')
        .map(s => +s);

    if (ticksParts.find(s => isNaN(s))) {
        return undefined;
    }

    const ticks = ticksParts
        .reduce((a, b) => a + b, 0);

    return isNaN(ticks) ? undefined : moment.utc(ticks).toDate();
};

export const isBeforeOrEqualToDate = (date: string | Date, before: string | Date): boolean => {
    return moment.utc(date).diff(moment.utc(before), 'd') <= 0;
};

export const DATE_FORMAT = 'YYYY-MM-DD';
