const { Component } = require('/Users/jiangyu/Desktop/core')
const { Apigw } = require('tencent-component-toolkit')
const { TypeError } = require('tencent-component-toolkit/src/utils/error')
const CONFIGS = require('./config')

class APIGatewayComponent extends Component {

  async getProperties(properties){
    const tempProperties = {}
    if(typeof properties == "object"){
      for(const item in properties){
        const tempItem =  item.charAt(0).toLowerCase() + item.substring(1)
        if(typeof properties[item] == "object"){
          if(properties[item] instanceof Array){
            const tempArray = []
            for(let i =0 ;i<properties[item].length;i++){
              tempArray.push(await this.getProperties(properties[item][i]))
            }
            tempProperties[tempItem] = tempArray
          }else{
            tempProperties[tempItem] = await this.getProperties(properties[item])
          }
        }else{
          tempProperties[tempItem] = properties[item]
        }
      }
      return tempProperties
    }
    return properties
  }

  async getInputs(inputs){
    const properties = {}
    const region = inputs.Properties.Region || CONFIGS.region
    properties.region = region
    if(inputs.Properties.Service){
      const tempService = inputs.Properties.Service
      if(tempService.Id){
        properties.serviceId = tempService.Id
      }
      if(tempService.Name){
        properties.serviceName = tempService.Name
      }
      if(tempService.Protocols){
        properties.protocols = tempService.Protocols
      }
      if(tempService.Description){
        properties.description = tempService.Description
      }
      if(tempService.Environment){
        properties.environment = tempService.Environment
      }
      if(tempService.NetTypes){
        properties.netTypes = tempService.NetTypes
      }
      if(tempService.Domains){
        properties.customDomain = await this.getProperties(tempService.Domains)
      }
    }
    if(inputs.Properties.API){
      properties.endpoints = []
      const tempAPI = inputs.Properties.API
      for(let i=0;i<tempAPI.length;i++){
        if(tempAPI[i].Parameters){
          const tempEveApi = tempAPI[i]
          for(let k=0;k<tempEveApi.Parameters.length;k++){
            if(tempEveApi.Parameters[k].Description){
              tempEveApi.Parameters[k].desc = JSON.parse(JSON.stringify(tempEveApi.Parameters[k].Description))
              delete tempEveApi.Parameters[k].Description
            }
          }
          tempAPI[i].param = JSON.parse(JSON.stringify(tempEveApi))
          delete tempAPI[i].Parameters
        }
        properties.endpoints.push(await this.getProperties(tempAPI[i]))
      }
    }
    return properties
  }

  async deploy(inputs) {

    console.log(this.args(inputs.Args))

    console.log(`Deploying API Gateway...`)

    // get tencent cloud credentials
    const credentials = {
      AppId: inputs.Credentials.AccountID,
      SecretId: inputs.Credentials.SecretID,
      SecretKey: inputs.Credentials.SecretKey,
    }

    const region = inputs.Properties.Region || CONFIGS.region
    const properties = await this.getInputs(inputs)

    await this.init()


    const state = this.state
    const args = inputs.Args

    const apigw = new Apigw(credentials, region)

    properties.oldState = state
    properties.serviceId = properties.serviceId || state.serviceId

    // make default config

    properties.region = properties.region || CONFIGS.region
    properties.serviceName = properties.serviceName || CONFIGS.serviceName
    properties.protocols = properties.protocols || CONFIGS.protocols
    properties.environment = properties.environment || CONFIGS.environment
    properties.description = properties.description || CONFIGS.description

    const deployRes = await apigw.deploy(properties)

    this.state = deployRes
    this.save()

    console.log(this.args2Json(inputs.Args))

    const apiOutput = []
    if (deployRes.apiList && deployRes.apiList.length > 0) {
      deployRes.apiList.forEach((api) => {
        const output = {
          path: api.path,
          method: api.method,
          apiId: api.apiId,
          internalDomain: api.internalDomain || undefined,
          usagePlanId: api.usagePlan && api.usagePlan.usagePlanId,
          secretIds:
            api.usagePlan &&
            api.usagePlan.secrets &&
            api.usagePlan.secrets.secretIds &&
            api.usagePlan.secrets.secretIds.length > 0 &&
            api.usagePlan.secrets.secretIds.join(',')
        }
        apiOutput.push(output)
      })
    }

    const outputs = {
      protocols: deployRes.protocols,
      subDomain: deployRes.subDomain,
      environment: deployRes.environment,
      region: properties.Region,
      serviceId: deployRes.serviceId,
      apis: apiOutput
    }

    if (deployRes.customDomains && deployRes.customDomains.length > 0) {
      outputs.customDomains = []
      deployRes.customDomains.forEach((domain) => {
        if (domain.isBinded === false) {
          outputs.customDomains.push({
            domain: domain.subDomain,
            cname: domain.cname,
            message: domain.message
          })
        } else {
          outputs.customDomains.push({
            domain: domain.subDomain,
            cname: domain.cname
          })
        }
      })
    }

    return outputs
  }

  async remove(inputs) {
    console.log(`Removing API Gateway...`)

    // get tencent cloud credentials
    const credentials = {
      AppId: inputs.Credentials.AccountID,
      SecretId: inputs.Credentials.SecretID,
      SecretKey: inputs.Credentials.SecretKey,
    }

    await this.init()
    const state = this.state
    const apigw = new Apigw(credentials, state.region)

    // support force delete api gateway by command param: --inputs.force
    if (inputs.force === true) {
      try {
        state.created = true
        if (state.apiList && state.apiList.length > 0) {
          state.apiList = state.apiList.map((item) => {
            item.created = true
            if (item.usagePlan) {
              item.usagePlan.created = true
              if (item.usagePlan.secrets) {
                item.usagePlan.secrets = item.usagePlan.secrets.map((up) => {
                  up.created = true
                  return up
                })
              }
            }
            return item
          })
        }
      } catch (e) {
      }
    }
    if (state && state.serviceId) {
      await apigw.remove(state)
    }
    this.state = {}
    this.save()
    return undefined
  }

}

module.exports = APIGatewayComponent
