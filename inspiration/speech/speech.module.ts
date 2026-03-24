// @ts-nocheck
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import * as common_1 from "@nestjs/common";
import * as speech_gateway_1 from "./speech.gateway";
import * as speech_service_1 from "./speech.service";
let SpeechModule = class SpeechModule {
};
export { SpeechModule };
exports.SpeechModule = SpeechModule = __decorate([
    (0, common_1.Module)({
        providers: [speech_gateway_1.SpeechGateway, speech_service_1.SpeechService],
    })
], SpeechModule);
