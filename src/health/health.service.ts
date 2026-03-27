import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectConnection } from '@nestjs/typeorm';

@Injectable()
export class HealthService {
    private readonly logger = new Logger(HealthService.name);

    constructor(@InjectConnection() private dataSource: DataSource) { }

    async getHealth() {
        this.logger.log('Performing health check...');
        const isDbConnected = this.dataSource.isInitialized;

        const health = {
            status: isDbConnected ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            database: isDbConnected ? 'connected' : 'disconnected',
        };

        if (isDbConnected) {
            this.logger.log('Health check passed: Database is connected.');
        } else {
            this.logger.error('Health check failed: Database is disconnected!');
        }

        return health;
    }
}
