function Header() {
  const currentDate = new Date().toLocaleDateString();

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            Biriyani Billing Software
          </h1>

          <p className="text-sm text-slate-500">
            Welcome back
          </p>
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