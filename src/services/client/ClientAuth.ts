import OrganConfigModel from '../../model/OrganConfigModel';
import moment = require('moment-timezone');
import axios, { AxiosProxyConfig, AxiosRequestConfig, AxiosInstance } from 'axios';
import * as axiosRetry from 'axios-retry';
import HmacSHA256 from 'crypto-js/hmac-sha256';
import Base64 from 'crypto-js/enc-base64'
import { IDeviceInfoResponse } from '../../interfaces/api/IDeviceInfoResponse';


export class ClientApi {
    private static instance: ClientApi;
    private loginAxiosInstance: AxiosInstance;
    private requestAxiosInstance: AxiosInstance;
    private token: string;
    private expire_at: number;


    constructor() {
        this.loginAxiosInstance = axios.create({
            baseURL: process.env.LOGIN_URL,
            method: 'post',
            headers: { 'X-Amz-Target' : 'AWSCognitoIdentityProviderService.InitiateAuth',
                       'Content-Type': 'application/x-amz-json-1.1' },
          });
        
        this.requestAxiosInstance = axios.create({
            baseURL: process.env.API_URL,
            method: 'get'
          });
        
    }

    public static getInstance(): ClientApi {
        if (!ClientApi.instance) {
            ClientApi.instance = new ClientApi();
        }
        return ClientApi.instance;
    }

    async refreshToken() : Promise<string>{
        const myKey = process.env.COGNITO_USERNAME + process.env.COGNITO_CLIENT_ID
        const mySecret = process.env.COGNITO_CLIENT_SECRET
        const hmac = HmacSHA256(myKey, mySecret)
        const secretHash = Base64.stringify(hmac)
        const data = {
            AuthParameters : {
                USERNAME: process.env.COGNITO_USERNAME,
                PASSWORD: process.env.COGNITO_PASSWORD,
                SECRET_HASH: secretHash
            },
            AuthFlow : "USER_PASSWORD_AUTH",
            ClientId : process.env.COGNITO_CLIENT_ID,
        }

        const config : AxiosRequestConfig  = {
            headers: {
                'X-Amz-Target' : 'AWSCognitoIdentityProviderService.InitiateAuth',
                'Content-Type': 'application/x-amz-json-1.1'
            }
        }
        try {
            const response = await this.loginAxiosInstance.post(process.env.LOGIN_URL, data, config);
            this.expire_at = new Date().getTime() + response.data.AuthenticationResult.ExpiresIn * 1000; // Assuming ExpiresIn is in seconds
            this.token = response.data.AuthenticationResult.IdToken;
            return this.token;
        } catch (error) {
            console.error('Error fetching token:', error);
            throw new Error('Failed to authenticate');
        }
    }

    async ensureTokenValid() {
        const now = new Date().getTime();
        if (this.token == null || now >= this.expire_at) {
            await this.refreshToken();
        }
    }

    async getDevices(): Promise<number[]> {
        await this.ensureTokenValid();
        const config : AxiosRequestConfig = {
            headers: {
                Authorization : this.token
            }
        }
        try{
            const response = await this.requestAxiosInstance.get(`/sites/${process.env.SITECODE}/devices`,config);
            return response.data.devices_ids
        } catch ( e){
            console.error(e)
        }
    }

    async getDeviceInfo(deviceId : number): Promise<IDeviceInfoResponse> {
        await this.ensureTokenValid();
        const config : AxiosRequestConfig = {
            headers: {
                Authorization : this.token
            }
        }
        const response = await this.requestAxiosInstance.get(`/sites/${process.env.SITECODE}/devices/${deviceId}`,config);
        return response.data;

    }

}