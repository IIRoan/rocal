type PrismaClient = {
  userRecentContacts: {
    findUnique: (query: { where: { userId: string } }) => Promise<unknown>;
  };
};

export function getRecentContacts(prisma: PrismaClient, userId: string) {
  return prisma.userRecentContacts.findUnique({ where: { userId } });
}
