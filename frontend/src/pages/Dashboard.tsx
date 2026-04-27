import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import PageHeading from "../components/PageHeading";

export default function Dashboard() {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = t("nav.dashboard") + " · Kanzec";
  }, [t]);
  return (
    <div>
      <PageHeading
        crumb={[t("nav.dashboard")]}
        title={t("nav.dashboard")}
      />
    </div>
  );
}
