"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class AxiosRateLimit {
    constructor(axiosInstance) {
        this.queue = [];
        this.timeslotRequests = 0;
        this.interceptors = { request: null, response: null };
        this.handleRequest = this.handleRequest.bind(this);
        this.handleResponse = this.handleResponse.bind(this);
        this.enable(axiosInstance);
    }
    getMaxRPS() {
        const perSeconds = this.perMilliseconds / 1000;
        return this.maxRequests / perSeconds;
    }
    getQueue() {
        return this.queue;
    }
    setMaxRPS(rps) {
        this.setRateLimitOptions({
            maxRequests: rps,
            perMilliseconds: 1000
        });
    }
    setRateLimitOptions(options) {
        if (options.maxRPS) {
            this.setMaxRPS(options.maxRPS);
        }
        else {
            if (options.perMilliseconds)
                this.perMilliseconds = options.perMilliseconds;
            if (options.maxRequests)
                this.maxRequests = options.maxRequests;
        }
    }
    enable(axiosInstance) {
        const handleError = (error) => Promise.reject(error);
        // @ts-expect-error - interceptors are not part of the AxiosInstance type
        this.interceptors.request = axiosInstance.interceptors.request.use(this.handleRequest, handleError);
        this.interceptors.response = axiosInstance.interceptors.response.use(this.handleResponse, handleError);
    }
    handleRequest(request) {
        return new Promise((resolve, reject) => {
            this.push({
                resolve: () => {
                    try {
                        throwIfCancellationRequested(request);
                    }
                    catch (error) {
                        reject(error);
                        return false;
                    }
                    resolve(request);
                    return true;
                }
            });
        });
    }
    handleResponse(response) {
        this.shift();
        return response;
    }
    push(requestHandler) {
        this.queue.push(requestHandler);
        this.shiftInitial();
    }
    shiftInitial() {
        setTimeout(() => this.shift(), 0);
    }
    shift() {
        if (!this.queue.length)
            return;
        if (this.timeslotRequests === this.maxRequests) {
            if (this.timeoutId && typeof this.timeoutId.ref === 'function') {
                this.timeoutId.ref();
            }
            return;
        }
        const queued = this.queue.shift();
        if (!queued)
            return;
        const resolved = queued.resolve();
        if (this.timeslotRequests === 0) {
            this.timeoutId = setTimeout(() => {
                this.timeslotRequests = 0;
                this.shift();
            }, this.perMilliseconds);
            if (typeof this.timeoutId.unref === 'function') {
                if (this.queue.length === 0)
                    this.timeoutId.unref();
            }
        }
        if (!resolved) {
            this.shift(); // rejected request --> shift another request
            return;
        }
        this.timeslotRequests += 1;
    }
}
function throwIfCancellationRequested(config) {
    if (config.cancelToken) {
        config.cancelToken.throwIfRequested();
    }
}
function axiosRateLimit(axiosInstance, options) {
    const rateLimitInstance = new AxiosRateLimit(axiosInstance);
    rateLimitInstance.setRateLimitOptions(options);
    axiosInstance.getQueue = rateLimitInstance.getQueue.bind(rateLimitInstance);
    axiosInstance.getMaxRPS = rateLimitInstance.getMaxRPS.bind(rateLimitInstance);
    axiosInstance.setMaxRPS = rateLimitInstance.setMaxRPS.bind(rateLimitInstance);
    axiosInstance.setRateLimitOptions = rateLimitInstance.setRateLimitOptions.bind(rateLimitInstance);
    return axiosInstance;
}
exports.default = axiosRateLimit;
