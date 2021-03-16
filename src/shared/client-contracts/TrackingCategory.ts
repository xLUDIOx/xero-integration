export interface ITrackingCategory {
    trackingCategoryID: string;
    name: string;
    status: TrackingCategoryStatus;
    options: ITrackingOption[];
}

export interface ITrackingOption {
    trackingOptionID: string;
    name: string;
    status: TrackingOptionStatus;
}

export enum TrackingOptionStatus {
    Active = 'ACTIVE',
}

export enum TrackingCategoryStatus {
    Active = 'ACTIVE',
}
