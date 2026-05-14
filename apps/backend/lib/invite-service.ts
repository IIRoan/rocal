import { InviteService } from "../services/invite.service";
import { prisma } from "./prisma";

export const inviteService = new InviteService(prisma);
