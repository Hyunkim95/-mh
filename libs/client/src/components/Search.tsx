
type KeyOf<T> = keyof T;

interface SearchCriterion<T> {
  // Object key used as a filter criterion
  key: KeyOf<T>;
  // Human friendly label for the UI
  label: string;
}

interface SearchProps<T = any> {
  // Current query string controlled by the parent component
  query: string;
  // Called whenever the query string changes
  onQueryChange: (query: string) => void;
  // Optional placeholder text
  placeholder?: string;
  // Optional list of criteria available for filtering (multi-select)
  criteria?: Array<SearchCriterion<T>>;
  // Active criteria keys; when omitted the consumer can assume a default field
  activeCriteria?: Array<KeyOf<T>>;
  // Called when criteria selection changes
  onCriteriaChange?: (keys: Array<KeyOf<T>>) => void;
  // Whether to show filter chips below the input
  showCriteriaChips?: boolean;
}

export const Search = <T,>({
  query,
  onQueryChange,
  placeholder = "Search tokens",
  criteria,
  activeCriteria = [],
  onCriteriaChange,
  showCriteriaChips = true,
}: SearchProps<T>) => {
  const handleToggle = (key: KeyOf<T>) => {
    if (!onCriteriaChange) return;
    const exists = activeCriteria.includes(key);
    const next = exists
      ? activeCriteria.filter((k) => k !== key)
      : [...activeCriteria, key];
    onCriteriaChange(next);
  };

  return (
    <div className="w-full">
      <div
        className="flex items-center gap-3 rounded-3xl h-12 px-4 bg-[rgba(34, 36, 38, 0.26)] border border-white/10 focus-within:border-white/20"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-white/40"
          aria-hidden
        >
          <path
            d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="flex-1 h-full bg-transparent outline-none text-[18px] leading-none text-white/90 placeholder:text-white/35"
        />
      </div>

      {showCriteriaChips && criteria && criteria.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {criteria.map((c) => {
            const selected = activeCriteria.includes(c.key);
            return (
              <button
                key={String(c.key)}
                type="button"
                onClick={() => handleToggle(c.key)}
                className={
                  selected
                    ? "px-3 py-1 rounded-full text-xs bg-white/15 text-white border border-white/25"
                    : "px-3 py-1 rounded-full text-xs bg-white/5 text-white/70 border border-white/10 hover:bg-white/10"
                }
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
