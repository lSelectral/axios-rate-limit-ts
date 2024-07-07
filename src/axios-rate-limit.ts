import { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'

export interface RateLimitedAxiosInstance extends AxiosInstance {
  getQueue: () => { resolve: () => boolean }[]
  getMaxRPS: () => number
  setMaxRPS: (rps: number) => void
  setRateLimitOptions: (options: { maxRequests?: number; perMilliseconds?: number; maxRPS?: number }) => void
}

class AxiosRateLimit {
  private queue: { resolve: () => boolean }[] = []
  private timeslotRequests: number = 0
  private interceptors: { request: number | null; response: number | null } = { request: null, response: null }
  private perMilliseconds!: number
  private maxRequests!: number
  private timeoutId?: NodeJS.Timeout

  constructor(axiosInstance: AxiosInstance) {
    this.handleRequest = this.handleRequest.bind(this)
    this.handleResponse = this.handleResponse.bind(this)

    this.enable(axiosInstance)
  }

  public getMaxRPS(): number {
    const perSeconds = this.perMilliseconds / 1000
    return this.maxRequests / perSeconds
  }

  public getQueue(): { resolve: () => boolean }[] {
    return this.queue
  }

  public setMaxRPS(rps: number): void {
    this.setRateLimitOptions({
      maxRequests: rps,
      perMilliseconds: 1000
    })
  }

  public setRateLimitOptions(options: { maxRequests?: number; perMilliseconds?: number; maxRPS?: number }): void {
    if (options.maxRPS) {
      this.setMaxRPS(options.maxRPS)
    } else {
      if (options.perMilliseconds) this.perMilliseconds = options.perMilliseconds
      if (options.maxRequests) this.maxRequests = options.maxRequests
    }
  }

  private enable(axiosInstance: AxiosInstance): void {
    const handleError = (error: AxiosError) => Promise.reject(error)

    // @ts-expect-error - interceptors are not part of the AxiosInstance type
    this.interceptors.request = axiosInstance.interceptors.request.use(this.handleRequest, handleError)
    this.interceptors.response = axiosInstance.interceptors.response.use(this.handleResponse, handleError)
  }

  private handleRequest(request: AxiosRequestConfig): Promise<AxiosRequestConfig> {
    return new Promise((resolve, reject) => {
      this.push({
        resolve: () => {
          try {
            throwIfCancellationRequested(request)
          } catch (error) {
            reject(error)
            return false
          }
          resolve(request)
          return true
        }
      })
    })
  }

  private handleResponse(response: AxiosResponse): AxiosResponse {
    this.shift()
    return response
  }

  private push(requestHandler: { resolve: () => boolean }): void {
    this.queue.push(requestHandler)
    this.shiftInitial()
  }

  private shiftInitial(): void {
    setTimeout(() => this.shift(), 0)
  }

  private shift(): void {
    if (!this.queue.length) return
    if (this.timeslotRequests === this.maxRequests) {
      if (this.timeoutId && typeof this.timeoutId.ref === 'function') {
        this.timeoutId.ref()
      }
      return
    }

    const queued = this.queue.shift()
    if (!queued) return
    const resolved = queued.resolve()

    if (this.timeslotRequests === 0) {
      this.timeoutId = setTimeout(() => {
        this.timeslotRequests = 0
        this.shift()
      }, this.perMilliseconds)

      if (typeof this.timeoutId.unref === 'function') {
        if (this.queue.length === 0) this.timeoutId.unref()
      }
    }

    if (!resolved) {
      this.shift() // rejected request --> shift another request
      return
    }

    this.timeslotRequests += 1
  }
}

function throwIfCancellationRequested(config: AxiosRequestConfig): void {
  if (config.cancelToken) {
    config.cancelToken.throwIfRequested()
  }
}

function axiosRateLimit(
  axiosInstance: RateLimitedAxiosInstance,
  options: { maxRequests?: number; perMilliseconds?: number; maxRPS?: number }
): AxiosInstance {
  const rateLimitInstance = new AxiosRateLimit(axiosInstance)
  rateLimitInstance.setRateLimitOptions(options)

  axiosInstance.getQueue = rateLimitInstance.getQueue.bind(rateLimitInstance)
  axiosInstance.getMaxRPS = rateLimitInstance.getMaxRPS.bind(rateLimitInstance)
  axiosInstance.setMaxRPS = rateLimitInstance.setMaxRPS.bind(rateLimitInstance)
  axiosInstance.setRateLimitOptions = rateLimitInstance.setRateLimitOptions.bind(rateLimitInstance)

  return axiosInstance
}

export default axiosRateLimit
