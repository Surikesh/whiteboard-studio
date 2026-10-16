import { type Editor, createShapeId, toRichText } from "tldraw";
import { SERVICE_TYPE } from "../shapes/types";
import { bindArrow } from "./arrow-binding";

export function addServiceArchitecture(editor: Editor) {
  const suffix = Date.now().toString(36);
  const ids = {
    gateway: createShapeId(`gateway-${suffix}`),
    orders: createShapeId(`orders-${suffix}`),
    payments: createShapeId(`payments-${suffix}`),
    database: createShapeId(`database-${suffix}`),
    arrow1: createShapeId(`service-arrow-1-${suffix}`),
    arrow2: createShapeId(`service-arrow-2-${suffix}`),
    arrow3: createShapeId(`service-arrow-3-${suffix}`),
    title: createShapeId(`service-title-${suffix}`),
  };
  const center = editor.getViewportPageBounds().center;
  const left = center.x - 620;
  const top = center.y - 230;

  editor.run(() => {
    editor.createShapes([
      {
        id: ids.title,
        type: "text",
        x: left,
        y: top - 95,
        props: {
          w: 700,
          size: "xl",
          font: "sans",
          richText: toRichText("Checkout architecture"),
        },
      },
      {
        id: ids.gateway,
        type: SERVICE_TYPE,
        x: left,
        y: top,
        props: {
          w: 260,
          h: 150,
          name: "API Gateway",
          technology: "Kong · REST",
          owner: "Platform Team",
          status: "healthy",
        },
      },
      {
        id: ids.orders,
        type: SERVICE_TYPE,
        x: left + 380,
        y: top,
        props: {
          w: 260,
          h: 150,
          name: "Orders",
          technology: "Java · Spring Boot",
          owner: "Checkout Team",
          status: "healthy",
        },
      },
      {
        id: ids.payments,
        type: SERVICE_TYPE,
        x: left + 760,
        y: top,
        props: {
          w: 260,
          h: 150,
          name: "Payments",
          technology: "Go · gRPC",
          owner: "Payments Team",
          status: "warning",
        },
      },
      {
        id: ids.database,
        type: "geo",
        x: left + 380,
        y: top + 290,
        props: {
          w: 260,
          h: 130,
          geo: "ellipse",
          color: "blue",
          fill: "none",
          richText: toRichText("Orders DB\nPostgreSQL"),
        },
      },
      {
        id: ids.arrow1,
        type: "arrow",
        x: 0,
        y: 0,
        props: {
          start: { x: left + 260, y: top + 75 },
          end: { x: left + 380, y: top + 75 },
          richText: toRichText("REST"),
        },
      },
      {
        id: ids.arrow2,
        type: "arrow",
        x: 0,
        y: 0,
        props: {
          start: { x: left + 640, y: top + 75 },
          end: { x: left + 760, y: top + 75 },
          richText: toRichText("event"),
        },
      },
      {
        id: ids.arrow3,
        type: "arrow",
        x: 0,
        y: 0,
        props: {
          start: { x: left + 510, y: top + 150 },
          end: { x: left + 510, y: top + 290 },
          richText: toRichText("SQL"),
        },
      },
    ]);
    bindArrow(editor, ids.arrow1, ids.gateway, ids.orders);
    bindArrow(editor, ids.arrow2, ids.orders, ids.payments);
    editor.createBinding({
      type: "arrow",
      fromId: ids.arrow3,
      toId: ids.orders,
      props: {
        terminal: "start",
        normalizedAnchor: { x: 0.5, y: 1 },
        isExact: false,
        isPrecise: true,
        snap: "edge",
      },
    });
    editor.createBinding({
      type: "arrow",
      fromId: ids.arrow3,
      toId: ids.database,
      props: {
        terminal: "end",
        normalizedAnchor: { x: 0.5, y: 0 },
        isExact: false,
        isPrecise: true,
        snap: "edge",
      },
    });
    editor.select(ids.gateway, ids.orders, ids.payments, ids.database);
  });
  editor.zoomToSelection({ animation: { duration: 350 } });
}
