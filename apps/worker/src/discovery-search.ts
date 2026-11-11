interface SearchRefreshRepository {
  listPendingMerchants(limit: number): Promise<readonly string[]>;
  refreshMerchant(merchantId: string): Promise<void>;
}

export function createSearchRefreshJob(repository: SearchRefreshRepository) {
  return async () => {
    const merchants = await repository.listPendingMerchants(50);
    const failures: unknown[] = [];
    for (const merchantId of merchants) {
      try {
        await repository.refreshMerchant(merchantId);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, "Search refresh batch failed.");
  };
}
