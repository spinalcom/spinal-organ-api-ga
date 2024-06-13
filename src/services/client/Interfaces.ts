export interface DeviceInfo {
  device_name: string;
  device_type: string;
}

export interface DeviceMeasure {
    measure_code: string;
    measure_name: string | null;
    measure_unit: string;
    measures? : Measure
}

export interface Measure {
    timestamp: string;
    value :  number

}

export interface DeviceInfoResponse {
    device_info : DeviceInfo,
    device_measures : DeviceMeasure[]
}