import { AxiosInstance } from 'axios';
export interface RateLimitedAxiosInstance extends AxiosInstance {
    getQueue: () => {
        resolve: () => boolean;
    }[];
    getMaxRPS: () => number;
    setMaxRPS: (rps: number) => void;
    setRateLimitOptions: (options: {
        maxRequests?: number;
        perMilliseconds?: number;
        maxRPS?: number;
    }) => void;
}
declare function axiosRateLimit(axiosInstance: RateLimitedAxiosInstance, options: {
    maxRequests?: number;
    perMilliseconds?: number;
    maxRPS?: number;
}): AxiosInstance;
export default axiosRateLimit;
