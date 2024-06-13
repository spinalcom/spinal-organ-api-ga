/*
 * Copyright 2021 SpinalCom - www.spinalcom.com
 *
 * This file is part of SpinalCore.
 *
 * Please read all of the following terms and conditions
 * of the Free Software license Agreement ("Agreement")
 * carefully.
 *
 * This Agreement is a legally binding contract between
 * the Licensee (as defined below) and SpinalCom that
 * sets forth the terms and conditions that govern your
 * use of the Program. By installing and/or using the
 * Program, you agree to abide by all the terms and
 * conditions stated or referenced herein.
 *
 * If you do not agree to abide by these terms and
 * conditions, do not demonstrate your acceptance and do
 * not install or use the Program.
 * You should have received a copy of the license along
 * with this file. If not, see
 * <http://resources.spinalcom.com/licenses.pdf>.
 */

import moment = require('moment');
import {
  SpinalContext,
  SpinalGraph,
  SpinalGraphService,
  SpinalNode,
  SpinalNodeRef,
  SPINAL_RELATION_PTR_LST_TYPE,
} from 'spinal-env-viewer-graph-service';

import type OrganConfigModel from '../../../model/OrganConfigModel';

import { attributeService } from 'spinal-env-viewer-plugin-documentation-service';
import { NetworkService , SpinalBmsEndpoint} from 'spinal-model-bmsnetwork';
import {
  InputDataDevice,
  InputDataEndpoint,
  InputDataEndpointGroup,
  InputDataEndpointDataType,
  InputDataEndpointType,
} from '../../../model/InputData/InputDataModel/InputDataModel';
import { SpinalServiceTimeseries } from 'spinal-model-timeseries';
import { ClientApi } from '../../../services/client/ClientAuth';
import { DeviceInfo, DeviceInfoResponse, DeviceMeasure } from '../../../services/client/Interfaces';
/**
 * Main purpose of this class is to pull tickets from client.
 *
 * @export
 * @class SyncRunPull
 */
export class SyncRunPull {
  graph: SpinalGraph<any>;
  config: OrganConfigModel;
  interval: number;
  running: boolean;
  deviceIds: number[];
  nwService: NetworkService;
  networkContext: SpinalNode<any>;
  timeseriesService: SpinalServiceTimeseries;
  private apiClient: ClientApi;

  constructor(
    graph: SpinalGraph<any>,
    config: OrganConfigModel,
    nwService: NetworkService
  ) {
    this.graph = graph;
    this.config = config;
    this.running = false;
    this.nwService = nwService;
    this.timeseriesService = new SpinalServiceTimeseries();
    this.apiClient = ClientApi.getInstance();
  }

  async getNetworkContext(): Promise<SpinalNode<any>> {
    const contexts = await this.graph.getChildren();
    for (const context of contexts) {
      if (context.info.name.get() === process.env.NETWORK_NAME) {
        // @ts-ignore
        SpinalGraphService._addNode(context);
        return context;
      }
    }
    throw new Error('Network Context Not found');
  }

  private waitFct(nb: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(
        () => {
          resolve();
        },
        nb >= 0 ? nb : 0
      );
    });
  }

  async createDevice(device : DeviceInfo){
    const deviceNodeModel = new InputDataDevice(device.device_name, 'device'); 
      await this.nwService.updateData(deviceNodeModel);
      console.log('Created device ', device.device_name);
      
      //await this.modifyMaxDayAttribute();
  }

  dateToNumber(dateString: string | Date) {
    const dateObj = new Date(dateString);
    return dateObj.getTime();
  }
  async addEndpointAttributes(node :SpinalNode<any>, measure : DeviceMeasure ){
    await attributeService.addAttributeByCategoryName(node,'GA','measure_code',measure.measure_code,'string')
  }

  async addDeviceAttributes(node :SpinalNode<any>, device : DeviceInfo, deviceId: number){
    await attributeService.addAttributeByCategoryName(node,'GA','device_id',`${deviceId}`,'number')
    await attributeService.addAttributeByCategoryName(node,'GA','device_type',device.device_type,'string')
  }

  async createEndpoint(deviceId: string, measure: DeviceMeasure , initialValue : number) {
    const context = this.networkContext;
    const endpointNodeModel = new InputDataEndpoint(
      measure.measure_name ?? 'Unnamed',
      initialValue,
      measure.measure_unit === 'None' ? '': measure.measure_unit,
      InputDataEndpointDataType.Real,
      InputDataEndpointType.Other
    );

    const res = new SpinalBmsEndpoint(
      endpointNodeModel.name,
      endpointNodeModel.path,
      endpointNodeModel.currentValue,
      endpointNodeModel.unit,
      InputDataEndpointDataType[endpointNodeModel.dataType],
      InputDataEndpointType[endpointNodeModel.type],
      endpointNodeModel.id
    );
    const childId = SpinalGraphService.createNode(
      { type: SpinalBmsEndpoint.nodeTypeName, name: endpointNodeModel.name },
      res
    );
    await SpinalGraphService.addChildInContext(
      deviceId,
      childId,
      context.getId().get(),
      SpinalBmsEndpoint.relationName,
      SPINAL_RELATION_PTR_LST_TYPE
    );

    const node  = SpinalGraphService.getRealNode(childId);
    await this.addEndpointAttributes(node,measure);
    return node


  }

  async updateEndpoints(){
    const devices = await this.apiClient.getDevices()
    this.deviceIds = devices;
    for(const deviceId of devices){
      const deviceInfo : DeviceInfoResponse = await this.apiClient.getDeviceInfo(deviceId);
      let devices = await this.networkContext.findInContext(
        this.networkContext,
        (node) => node.info.name.get() === deviceInfo.device_info.device_name
      );
      if (devices.length == 0) {
        console.log('Device do not exist, creating new device... ', deviceInfo.device_info.device_name);
        await this.createDevice(deviceInfo.device_info);
        devices = await this.networkContext.findInContext(
          this.networkContext,
          (node) => node.info.name.get() === deviceInfo.device_info.device_name
        );

      }
      const deviceNode = devices[0];

      // @ts-ignore
      SpinalGraphService._addNode(deviceNode);
      this.addDeviceAttributes(deviceNode,deviceInfo.device_info,deviceId)

      const endpointNodes = await deviceNode.getChildren('hasBmsEndpoint');
      for(const measure of deviceInfo.device_measures){
        const measureValue = measure.measures?.value ?? NaN;

        let endpointNode = endpointNodes.find((node) => node.info.name.get() === measure.measure_name);
        if(!endpointNode){
          // Create new endpoint
          console.log('Endpoint do not exist, creating new endpoint... ', measure.measure_name);
          endpointNode = await this.createEndpoint(deviceNode.getId().get(),measure, measureValue);
          SpinalGraphService._addNode(endpointNode);
        }
        else {
          SpinalGraphService._addNode(endpointNode);
          this.nwService.setEndpointValue(endpointNode.info.id.get(), measureValue)
        }
        if(!isNaN(measureValue)){
          this.timeseriesService.pushFromEndpoint(endpointNode.info.id.get(), measureValue);
        }
        console.log('Updated endpoint ', measure.measure_name , "with value :",measureValue);
          
        
      }
      
    }
  }

  

  async init(): Promise<void> {
    console.log('Initiating SyncRunPull');
    this.networkContext = await this.getNetworkContext();
    try {
      await this.updateEndpoints();
      this.config.lastSync.set(Date.now());
      console.log('Init DONE !')
    } catch (e) {
      console.error(e);
    }
  }

  async run(): Promise<void> {
    this.running = true;
    const timeout = parseInt(process.env.PULL_INTERVAL)
    await this.waitFct(timeout);
    while (true) {
      if (!this.running) break;
      const before = Date.now();
      try {
        console.log("Updating Data...");
        await this.updateEndpoints();
        console.log("... Data Updated !")
        this.config.client.lastSync.set(Date.now());
      } catch (e) {
        console.error(e);
        await this.waitFct(1000 * 60);
      } finally {
        const delta = Date.now() - before;
        const timeout = parseInt(process.env.PULL_INTERVAL) - delta;
        await this.waitFct(timeout);
      }
    }
    
  }

  stop(): void {
    this.running = false;
  }
}
export default SyncRunPull;
