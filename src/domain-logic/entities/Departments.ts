export class Department {
    constructor(
        readonly id: string,
        readonly name: string,
        readonly parent?: string,
    ) {
    }
}
