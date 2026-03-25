import { ChartBarIcon, PresentationChartBarIcon, TableCellsIcon, } from "@heroicons/react/24/outline";
import React from "react";
const PageNav = (props) => {
    const NavLinks = [
        { name: "Data", link: "/", icon: (className) => React.createElement(TableCellsIcon, { className: className }) },
        { name: "Explore", link: "/about", icon: (className) => React.createElement(ChartBarIcon, { className: className }) },
        {
            name: "Dashboard",
            link: "/contact",
            icon: (className) => React.createElement(PresentationChartBarIcon, { className: className }),
        },
    ];
    return (React.createElement("div", { className: "w-fit h-5/6 m-2 rounded-xl bg-primary shadow-2xl" },
        React.createElement("div", { className: "flex flex-col" },
            React.createElement("div", { className: "p-2 m-2 mb-6 rounded text-primary-foreground text-center flex items-center flex-col" },
                React.createElement("h1", { className: "text-3xl font-bold" }, "V.")),
            NavLinks.map((link, index) => (React.createElement("div", { key: index, className: "p-2 m-2 rounded text-primary-foreground hover:bg-primary/90 text-center flex items-center flex-col cursor-pointer" },
                link.icon("w-6"),
                React.createElement("a", { className: "text-xs", href: link.link }, link.name)))))));
};
export default PageNav;
//# sourceMappingURL=pageNav.js.map