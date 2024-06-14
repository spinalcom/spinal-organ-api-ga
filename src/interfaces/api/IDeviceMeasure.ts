import { IMeasure } from "./IMeasure";

export interface IDeviceMeasure {
    measure_code: string;
    measure_name: string | null;
    measure_unit: string;
    measures? : IMeasure
}