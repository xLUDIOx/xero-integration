export interface ITrackingCategory {
    trackingCategoryId: string;
    name: string;
    status: TrackingCategoryStatus;
    options: ITrackingOption[];
}

export interface ITrackingOption {
    trackingOptionId: string;
    name: string;
    status: TrackingOptionStatus;
    isDeleted: boolean;
    isArchived: boolean;
    isActive: boolean;
    hasValidationErrors: boolean;
}

export enum TrackingOptionStatus {
    Active = 'ACTIVE',
}

export enum TrackingCategoryStatus {
    Active = 'ACTIVE',
}
