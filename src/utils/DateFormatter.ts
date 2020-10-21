import * as moment from 'moment';

export const formatDate = (date: string | Date): string => {
    return moment.utc(date).format(DATE_FORMAT);
};

export const DATE_FORMAT = 'YYYY-MM-DD';
