# React + Vite

## Dynamic picklist ordering

`Widget_Picklist_Config.Sort_Order` is an ascending numeric priority, not a row
position. For example, Other = 5, Fruit = 9, and Meeting = 10 display as Other,
Fruit, Meeting; 9 does not mean the ninth option. Set unique priorities within
each category (and parent type for Result/Regarding) to control the order.
Zero is valid. Blank or invalid priorities appear after numbered values;
equal priorities retain the CRM response order. Reload the widget after changing
configuration because successful reads are cached for the widget session.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh
