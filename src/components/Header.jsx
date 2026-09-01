function Header({ onMenuClick }) {
  const currentDate = new Date().toLocaleDateString();

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open navigation"
            className="flex h-10 w-10 flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            <span className="h-0.5 w-5 bg-slate-700" />
            <span className="h-0.5 w-5 bg-slate-700" />
            <span className="h-0.5 w-5 bg-slate-700" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              Biriyani Billing Software
            </h1>

            <p className="text-sm text-slate-500">
              Welcome back
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-sm text-slate-500">
            Date
          </p>

          <p className="font-semibold text-slate-800">
            {currentDate}
          </p>
        </div>
      </div>
    </header>
  );
}

export default Header;
