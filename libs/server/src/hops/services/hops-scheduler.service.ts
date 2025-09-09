import { CronJob } from 'cron';
import { hopsService } from "./hops.service";
import { routesService } from "../../routes/services/routes.service";

const triggerHopJob = new CronJob('0 0 * * *', async () => {
    const hops = await hopsService.getNextExecutableHops(new Date());
    for (const hop of hops) {
        await routesService.triggerNextHop(hop.routeId);
    }
});

export const hopsSchedulerService = {
    triggerHopJob,
}