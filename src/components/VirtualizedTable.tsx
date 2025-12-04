import { memo, ReactNode } from "react";

interface Column<T> {
  key: string;
  header: string;
  width?: string;
  render: (item: T, index: number) => ReactNode;
}

interface VirtualizedTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
  isLoading?: boolean;
  loadingComponent?: ReactNode;
  headerClassName?: string;
  rowClassName?: string | ((item: T) => string);
}

const TableRow = memo(function TableRow<T>({
  item,
  index,
  columns,
  rowClassName,
}: {
  item: T;
  index: number;
  columns: Column<T>[];
  rowClassName?: string | ((item: T) => string);
}) {
  const className = typeof rowClassName === "function" 
    ? rowClassName(item) 
    : rowClassName || "";

  return (
    <div className={`flex items-center border-b hover:bg-muted/50 ${className}`}>
      {columns.map((column) => (
        <div
          key={column.key}
          className="px-4 py-3 flex-shrink-0"
          style={{ width: column.width || "auto", flex: column.width ? "none" : 1 }}
        >
          {column.render(item, index)}
        </div>
      ))}
    </div>
  );
}) as <T>(props: {
  item: T;
  index: number;
  columns: Column<T>[];
  rowClassName?: string | ((item: T) => string);
}) => JSX.Element;

export function VirtualizedTable<T>({
  data,
  columns,
  keyExtractor,
  emptyMessage = "Nenhum dado encontrado",
  isLoading = false,
  loadingComponent,
  headerClassName = "",
  rowClassName,
}: VirtualizedTableProps<T>) {
  if (isLoading && loadingComponent) {
    return <>{loadingComponent}</>;
  }

  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className={`flex items-center bg-muted/50 border-b ${headerClassName}`}>
        {columns.map((column) => (
          <div
            key={column.key}
            className="px-4 py-3 font-semibold flex-shrink-0"
            style={{ width: column.width || "auto", flex: column.width ? "none" : 1 }}
          >
            {column.header}
          </div>
        ))}
      </div>
      {/* Body */}
      <div>
        {data.map((item, index) => (
          <TableRow
            key={keyExtractor(item)}
            item={item}
            index={index}
            columns={columns}
            rowClassName={rowClassName}
          />
        ))}
      </div>
    </div>
  );
}

export default VirtualizedTable;
