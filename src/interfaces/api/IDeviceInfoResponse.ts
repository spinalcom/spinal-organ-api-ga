import { IDeviceInfo } from "./IDeviceInfo";
import { IDeviceMeasure } from "./IDeviceMeasure";


export interface IDeviceInfoResponse {
    device_info : IDeviceInfo,
    device_measures : IDeviceMeasure[]
}