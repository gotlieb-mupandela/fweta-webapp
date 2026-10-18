import { Button } from "@/components/ui/button";
import { SADC_COUNTRIES } from "@/lib/rewards/content-rewards";

export function DiscoverFilters({
  q,
  type,
  platform,
  category,
  sort,
  payModel,
  country,
  minRate,
  minBudget,
  categories,
}: {
  q?: string;
  type?: string;
  platform?: string;
  category?: string;
  sort?: string;
  payModel?: string;
  country?: string;
  minRate?: string;
  minBudget?: string;
  categories: string[];
}) {
  return (
    <form className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <input
        name="q"
        defaultValue={q}
        placeholder="Search campaigns"
        className="input-capsule col-span-2 h-11 sm:min-w-[180px] sm:flex-1"
      />
      <select name="payModel" defaultValue={payModel ?? ""} className="input-capsule h-11" aria-label="Pay model">
        <option value="">CPM and pool</option>
        <option value="cpm">CPM</option>
        <option value="pool">Pool</option>
      </select>
      <select name="country" defaultValue={country ?? "NA"} className="input-capsule h-11" aria-label="Country">
        <option value="NA">Namibia</option>
        <option value="all">All countries</option>
        {SADC_COUNTRIES.filter((item) => item.code !== "NA").map((item) => (
          <option key={item.code} value={item.code}>
            {item.name}
          </option>
        ))}
      </select>
      <input
        name="minRate"
        defaultValue={minRate}
        inputMode="decimal"
        placeholder="Min rate (N$)"
        aria-label="Minimum rate"
        className="input-capsule h-11"
      />
      <input
        name="minBudget"
        defaultValue={minBudget}
        inputMode="decimal"
        placeholder="Budget left (N$)"
        aria-label="Minimum budget left"
        className="input-capsule h-11"
      />
      {platform ? <input type="hidden" name="platform" value={platform} /> : null}
      <select name="type" defaultValue={type ?? ""} className="input-capsule h-11" aria-label="Type">
        <option value="">All types</option>
        <option value="clipping">Clipping</option>
        <option value="ugc">UGC</option>
      </select>
      <select
        name="category"
        defaultValue={category ?? ""}
        className="input-capsule h-11"
        aria-label="Category"
      >
        <option value="">All categories</option>
        {categories.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <select name="sort" defaultValue={sort ?? "newest"} className="input-capsule h-11" aria-label="Sort">
        <option value="newest">Newest</option>
        <option value="budget">Budget left</option>
        <option value="rate">Rate</option>
        <option value="paid">Paid out</option>
      </select>
      <Button type="submit" size="sm" className="col-span-2 sm:col-span-1">
        Apply
      </Button>
    </form>
  );
}
