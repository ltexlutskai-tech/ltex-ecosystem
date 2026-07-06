import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canManageCatalog } from "@/lib/manager/catalog-permissions";
import { CategoryForm } from "./_components/category-form";
import { DeleteCategoryButton } from "./_components/delete-category-button";
import { HiddenToggle } from "./_components/hidden-toggle";

export const dynamic = "force-dynamic";
export const metadata = { title: "Категорії — L-TEX Manager" };

interface CatNode {
  id: string;
  name: string;
  slug: string;
  code1C: string | null;
  hiddenFromCatalog: boolean;
  parentId: string | null;
  productCount: number;
  children: CatNode[];
}

function Code1CBadge() {
  return (
    <span className="ml-2 rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">
      1С
    </span>
  );
}

export default async function ManagerCategoriesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");
  const canManage = canManageCatalog(user.role);

  const rows = await prisma.category.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      code1C: true,
      hiddenFromCatalog: true,
      parentId: true,
      _count: { select: { products: true } },
    },
  });

  // Дерево з плаского списку.
  const nodes = new Map<string, CatNode>();
  for (const r of rows) {
    nodes.set(r.id, {
      id: r.id,
      name: r.name,
      slug: r.slug,
      code1C: r.code1C,
      hiddenFromCatalog: r.hiddenFromCatalog,
      parentId: r.parentId,
      productCount: r._count.products,
      children: [],
    });
  }
  const roots: CatNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Вузли для каскадного вибору батька (рівень за рівнем).
  const cascaderNodes = rows.map((r) => ({
    id: r.id,
    name: r.name,
    parentId: r.parentId,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Категорії</h1>
        <p className="mt-1 text-sm text-gray-600">
          Дерево як у 1С: Тип → Сезон → Категорія → Підкатегорія. Категорії з 1С
          <Code1CBadge /> видаляти не можна. «Прихована» — товари цієї гілки не
          показуються на сайті й торговим агентам.
        </p>
      </div>

      {canManage && (
        <div className="max-w-lg rounded-lg border bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">
            Додати категорію
          </h2>
          <CategoryForm nodes={cascaderNodes} />
        </div>
      )}

      <div className="rounded-lg border bg-white">
        {roots.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">Категорій немає.</p>
        ) : (
          <ul>
            {roots.map((node) => (
              <CategoryRow
                key={node.id}
                node={node}
                depth={0}
                canManage={canManage}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CategoryRow({
  node,
  depth,
  canManage,
}: {
  node: CatNode;
  depth: number;
  canManage: boolean;
}) {
  const deletable =
    canManage &&
    !node.code1C &&
    node.productCount === 0 &&
    node.children.length === 0;

  return (
    <li className="border-b last:border-b-0">
      <div
        className="flex items-center justify-between gap-2 px-4 py-2"
        style={{ paddingLeft: `${16 + depth * 20}px` }}
      >
        <div className="min-w-0">
          <span
            className={
              depth === 0
                ? "font-semibold text-gray-800"
                : "text-sm text-gray-700"
            }
          >
            {node.name}
          </span>
          {node.code1C && <Code1CBadge />}
          <span className="ml-2 text-xs text-gray-400">/{node.slug}</span>
          <span className="ml-2 text-xs text-gray-500">
            ({node.productCount})
          </span>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            <HiddenToggle
              categoryId={node.id}
              hidden={node.hiddenFromCatalog}
            />
            {deletable && (
              <DeleteCategoryButton
                categoryId={node.id}
                categoryName={node.name}
              />
            )}
          </div>
        )}
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <CategoryRow
              key={child.id}
              node={child}
              depth={depth + 1}
              canManage={canManage}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
