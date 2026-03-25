import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectConnection } from '@nestjs/typeorm';

@Injectable()
export class HealthService {
    constructor(@InjectConnection() private dataSource: DataSource) {}

    async getHealth() {
        const isDbConnected = this.dataSource.isInitialized;
        
        return {
            status: isDbConnected ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            database: isDbConnected ? 'connected' : 'disconnected',
        };
    }
}
