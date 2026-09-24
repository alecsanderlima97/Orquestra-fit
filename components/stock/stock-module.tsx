"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  AlertTriangle,
  Boxes,
  Download,
  Package,
  QrCode,
  Wrench,
  X,
} from "lucide-react";
import { useAccess } from "@/components/auth/access-context";
import { db } from "@/lib/firebase/client";

type StockKind = "product" | "machine" | "internal";
type MovementType = "entrada" | "saída";
type StockItem = {
  id: string;
  kind: StockKind;
  name: string;
  category?: string;
  description?: string;
  quantity: number;
  minimum: number;
  entered: number;
  exited: number;
  photoUrl?: string;
  machineCode?: string;
  supplier?: string;
  purchasePrice?: number;
  salePrice?: number;
  barcode?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  location?: string;
  equipmentStatus?: "novo" | "bom" | "atencao" | "interditado" | "manutencao";
  purchaseDate?: string;
  warrantyUntil?: string;
  maintenanceDue?: string;
  maintenanceProvider?: string;
};
type StockMovement = {
  id: string;
  itemId?: string;
  itemName: string;
  type: MovementType;
  quantity: number;
  date: string;
  note?: string;
  balance?: number;
  buyerName?: string;
  paymentMethod?: string;
  totalAmount?: number;
};
const key = (academyId: string, name: string) =>
  `orquestra-fit:${academyId}:stock-${name}`;
const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
    .map((part) => part.value)
    .join("-");
const addMonths = (date: string, months: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setMonth(value.getMonth() + months);
  return value.toISOString().slice(0, 10);
};

export function StockModule({
  onFeedback,
}: {
  onFeedback: (message: string) => void;
}) {
  const access = useAccess();
  const [items, setItems] = useState<StockItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [kind, setKind] = useState<StockKind>("product");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [description, setDescription] = useState("");
  const [minimum, setMinimum] = useState("0");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [supplier, setSupplier] = useState("");
  const [barcode, setBarcode] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [location, setLocation] = useState("");
  const [equipmentStatus, setEquipmentStatus] = useState<NonNullable<StockItem["equipmentStatus"]>>("bom");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [warrantyUntil, setWarrantyUntil] = useState("");
  const [maintenanceDue, setMaintenanceDue] = useState("");
  const [maintenanceProvider, setMaintenanceProvider] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Todas");
  const [selected, setSelected] = useState<StockItem | null>(null);
  const [movementType, setMovementType] = useState<MovementType>("entrada");
  const [movementQuantity, setMovementQuantity] = useState("");
  const [movementNote, setMovementNote] = useState("");
  const [purchaseInvoiceNumber, setPurchaseInvoiceNumber] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Pix");
  const [unitValue, setUnitValue] = useState("");
  const [registerPurchase, setRegisterPurchase] = useState(true);
  const [purchasePayment, setPurchasePayment] = useState<"paid" | "pending">(
    "paid",
  );
  const [purchaseDueDate, setPurchaseDueDate] = useState(today());
  const [purchaseInstallments, setPurchaseInstallments] = useState("1");
  const [qrItem, setQrItem] = useState<StockItem | null>(null);
  const [qrImage, setQrImage] = useState("");
  useEffect(() => {
    if (!db) {
      const timer = window.setTimeout(() => {
        try {
          setItems(
            JSON.parse(
              localStorage.getItem(key(access.academyId, "items")) || "[]",
            ),
          );
          setCategories(
            JSON.parse(
              localStorage.getItem(key(access.academyId, "categories")) || "[]",
            ),
          );
          setMovements(
            JSON.parse(
              localStorage.getItem(key(access.academyId, "movements")) || "[]",
            ),
          );
        } catch {
          setItems([]);
          setCategories([]);
          setMovements([]);
        }
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const offItems = onSnapshot(
      collection(db, "academies", access.academyId, "stockItems"),
      (snap) =>
        setItems(
          snap.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<StockItem, "id">),
            quantity: Number(item.data().quantity || 0),
            minimum: Number(item.data().minimum || 0),
            entered: Number(item.data().entered || 0),
            exited: Number(item.data().exited || 0),
          })),
        ),
    );
    const offCategories = onSnapshot(
      collection(db, "academies", access.academyId, "stockCategories"),
      (snap) =>
        setCategories(
          snap.docs
            .map((item) => String(item.data().name || ""))
            .filter(Boolean),
        ),
    );
    const offMovements = onSnapshot(
      collection(db, "academies", access.academyId, "stockMovements"),
      (snap) =>
        setMovements(
          snap.docs
            .map((item) => ({
              id: item.id,
              ...(item.data() as Omit<StockMovement, "id">),
            }))
            .sort((a, b) => b.date.localeCompare(a.date)),
        ),
    );
    return () => {
      offItems();
      offCategories();
      offMovements();
    };
  }, [access.academyId]);
  const products = items.filter((item) => item.kind === "product");
  const machines = items.filter((item) => item.kind === "machine");
  const internalItems = items.filter((item) => item.kind === "internal");
  const lowStock = products.filter((item) => item.quantity <= item.minimum);
  const visibleItems =
    categoryFilter === "Todas"
      ? items
      : items.filter(
          (item) => (item.category || "Sem categoria") === categoryFilter,
        );
  function write(name: string, data: unknown[]) {
    localStorage.setItem(key(access.academyId, name), JSON.stringify(data));
  }
  async function createCategory() {
    const value = newCategory.trim();
    if (!value || categories.includes(value)) return;
    if (!db) {
      const next = [...categories, value];
      write("categories", next);
      setCategories(next);
    } else
      await addDoc(
        collection(db, "academies", access.academyId, "stockCategories"),
        { name: value, createdBy: access.userId, createdAt: serverTimestamp() },
      );
    setCategory(value);
    setNewCategory("");
    onFeedback("Categoria criada.");
  }
  async function saveItem(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const item = {
      kind,
      name: name.trim(),
      category: category || "Sem categoria",
      description: description.trim(),
      quantity: editingId
        ? items.find((current) => current.id === editingId)?.quantity || 0
        : 0,
      minimum: Number(minimum) || 0,
      entered: editingId
        ? items.find((current) => current.id === editingId)?.entered || 0
        : 0,
      exited: editingId
        ? items.find((current) => current.id === editingId)?.exited || 0
        : 0,
      supplier: supplier.trim() || undefined,
      barcode: barcode.trim() || undefined,
      purchasePrice: Number(purchasePrice.replace(",", ".")) || undefined,
      salePrice:
        kind === "product"
          ? Number(salePrice.replace(",", ".")) || undefined
          : undefined,
      photoUrl: photoUrl || undefined,
      ...(kind === "machine"
        ? {
            brand: brand.trim() || undefined,
            model: model.trim() || undefined,
            serialNumber: serialNumber.trim() || undefined,
            location: location.trim() || undefined,
            equipmentStatus,
            purchaseDate: purchaseDate || undefined,
            warrantyUntil: warrantyUntil || undefined,
            maintenanceDue: maintenanceDue || undefined,
            maintenanceProvider: maintenanceProvider.trim() || undefined,
          }
        : {}),
      ...(kind === "machine"
        ? {
            machineCode:
              items.find((current) => current.id === editingId)?.machineCode ||
              `ORQ-MACHINE-${Date.now()}`,
          }
        : {}),
    };
    if (!db) {
      const next = editingId
        ? items.map((current) =>
            current.id === editingId ? { ...current, ...item } : current,
          )
        : [{ id: `local-stock-${Date.now()}`, ...item }, ...items];
      write("items", next);
      setItems(next);
    } else if (editingId)
      await updateDoc(
        doc(db, "academies", access.academyId, "stockItems", editingId),
        { ...Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined)), updatedAt: serverTimestamp() },
      );
    else
      await addDoc(
        collection(db, "academies", access.academyId, "stockItems"),
        { ...Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined)), createdBy: access.userId, createdAt: serverTimestamp() },
      );
    setEditingId(null);
    setName("");
    setCategory("");
    setDescription("");
    setMinimum("0");
    setPurchasePrice("");
    setSalePrice("");
    setSupplier("");
    setBarcode("");
    setPhotoUrl("");
    setBrand(""); setModel(""); setSerialNumber(""); setLocation(""); setEquipmentStatus("bom"); setPurchaseDate(""); setWarrantyUntil(""); setMaintenanceDue(""); setMaintenanceProvider("");
    onFeedback(
      editingId
        ? "Item atualizado."
        : kind === "machine"
          ? "Máquina cadastrada. Registre a compra e gere o QR Code na lista."
          : kind === "internal"
            ? "Material interno cadastrado. Registre a compra para atualizar o patrimônio."
            : "Produto cadastrado. Registre uma entrada para atualizar o saldo.",
    );
  }
  function editItem(item: StockItem) {
    setEditingId(item.id);
    setKind(item.kind);
    setName(item.name);
    setCategory(item.category || "");
    setDescription(item.description || "");
    setMinimum(String(item.minimum || 0));
    setPurchasePrice(
      item.purchasePrice ? String(item.purchasePrice).replace(".", ",") : "",
    );
    setSalePrice(
      item.salePrice ? String(item.salePrice).replace(".", ",") : "",
    );
    setSupplier(item.supplier || "");
    setBarcode(item.barcode || "");
    setPhotoUrl(item.photoUrl || "");
    setBrand(item.brand || ""); setModel(item.model || ""); setSerialNumber(item.serialNumber || ""); setLocation(item.location || ""); setEquipmentStatus(item.equipmentStatus || "bom"); setPurchaseDate(item.purchaseDate || ""); setWarrantyUntil(item.warrantyUntil || ""); setMaintenanceDue(item.maintenanceDue || ""); setMaintenanceProvider(item.maintenanceProvider || "");
  }
  function openMovement(item: StockItem, type: MovementType) {
    setSelected(item);
    setMovementType(type);
    setMovementQuantity("");
    setMovementNote("");
    setPurchaseInvoiceNumber("");
    setBuyerName("");
    setUnitValue(
      type === "saída" && item.kind === "product" && item.salePrice
        ? String(item.salePrice).replace(".", ",")
        : item.purchasePrice
          ? String(item.purchasePrice).replace(".", ",")
          : "",
    );
    setRegisterPurchase(true);
    setPurchasePayment("paid");
    setPurchaseDueDate(today());
    setPurchaseInstallments("1");
  }
  async function registerMovement(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const quantity = Number(movementQuantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      onFeedback("Informe uma quantidade inteira maior que zero.");
      return;
    }
    const balance =
      selected.quantity + (movementType === "entrada" ? quantity : -quantity);
    if (balance < 0) {
      onFeedback("A saída não pode ser maior que o saldo atual.");
      return;
    }
    const totalAmount = Number(unitValue.replace(",", ".")) * quantity || 0;
    const purchaseCount = Math.min(
      36,
      Math.max(1, Number.parseInt(purchaseInstallments, 10) || 1),
    );
    const installmentAmount =
      purchaseCount > 1
        ? Math.round((totalAmount / purchaseCount) * 100) / 100
        : totalAmount;
    const updated = {
      quantity: balance,
      entered: selected.entered + (movementType === "entrada" ? quantity : 0),
      exited: selected.exited + (movementType === "saída" ? quantity : 0),
      updatedAt: serverTimestamp(),
    };
    const movement = {
      itemId: selected.id,
      itemName: selected.name,
      type: movementType,
      quantity,
      date: new Date().toISOString(),
      note: movementNote.trim(),
      balance,
      ...(movementType === "saída" && buyerName.trim()
        ? { buyerName: buyerName.trim(), paymentMethod, totalAmount }
        : {}),
    };
    if (!db) {
      const nextItems = items.map((item) =>
        item.id === selected.id
          ? { ...item, ...updated, updatedAt: undefined }
          : item,
      );
      const nextMovements = [
        { id: `local-movement-${Date.now()}`, ...movement },
        ...movements,
      ];
      write("items", nextItems);
      write("movements", nextMovements);
      setItems(nextItems);
      setMovements(nextMovements);
      if (
        selected.kind === "product" &&
        movementType === "saída" &&
        buyerName.trim() &&
        totalAmount > 0
      ) {
        const sales = JSON.parse(
          localStorage.getItem(`orquestra-fit:${access.academyId}:financialSales`) || "[]",
        );
        localStorage.setItem(
          `orquestra-fit:${access.academyId}:financialSales`,
          JSON.stringify([
            {
              id: `local-sale-${Date.now()}`,
              description: `Venda · ${selected.name}`,
              studentName: buyerName.trim(),
              amount: totalAmount,
              paymentMethod,
              date: new Date().toISOString(),
            },
            ...sales,
          ]),
        );
      }
      window.dispatchEvent(new Event("orquestra-fit:collection-updated"));
      if (movementType === "entrada" && registerPurchase && totalAmount > 0) {
        const expenses = JSON.parse(
          localStorage.getItem(
            `orquestra-fit:${access.academyId}:financialExpenses`,
          ) || "[]",
        );
        const newExpenses = Array.from(
          { length: purchasePayment === "pending" ? purchaseCount : 1 },
          (_, index) => ({
            id: `local-expense-${Date.now()}-${index}`,
            kind: "payable",
            description: `Compra para ${selected.kind === "product" ? "estoque" : "patrimônio"} · ${selected.name}${purchaseCount > 1 ? ` (${index + 1}/${purchaseCount})` : ""}`,
            supplier: selected.supplier || movementNote.trim() || undefined,
            invoiceNumber: purchaseInvoiceNumber.trim() || undefined,
            amount:
              purchasePayment === "pending" && index === purchaseCount - 1
                ? totalAmount - installmentAmount * (purchaseCount - 1)
                : installmentAmount,
            dueDate:
              purchasePayment === "pending"
                ? addMonths(purchaseDueDate, index)
                : today(),
            status: purchasePayment,
            origin: "stock",
            stockItemId: selected.id,
            date: new Date().toISOString(),
          }),
        );
        localStorage.setItem(
          `orquestra-fit:${access.academyId}:financialExpenses`,
          JSON.stringify([...newExpenses, ...expenses]),
        );
        window.dispatchEvent(new Event("orquestra-fit:collection-updated"));
      }
    } else {
      await updateDoc(
        doc(db, "academies", access.academyId, "stockItems", selected.id),
        updated,
      );
      await addDoc(
        collection(db, "academies", access.academyId, "stockMovements"),
        { ...movement, createdBy: access.userId, createdAt: serverTimestamp() },
      );
      if (
        selected.kind === "product" &&
        movementType === "saída" &&
        buyerName.trim() &&
        totalAmount > 0
      )
        await addDoc(
          collection(db, "academies", access.academyId, "financialSales"),
          {
            description: `Venda · ${selected.name}`,
            studentName: buyerName.trim(),
            amount: totalAmount,
            paymentMethod,
            date: new Date().toISOString(),
            createdBy: access.userId,
            createdAt: serverTimestamp(),
          },
        );
      if (movementType === "entrada" && registerPurchase && totalAmount > 0)
        for (
          let index = 0;
          index < (purchasePayment === "pending" ? purchaseCount : 1);
          index += 1
        )
          await addDoc(
            collection(db, "academies", access.academyId, "financialExpenses"),
            {
              kind: "payable",
              description: `Compra para ${selected.kind === "product" ? "estoque" : "patrimônio"} · ${selected.name}${purchaseCount > 1 ? ` (${index + 1}/${purchaseCount})` : ""}`,
              supplier: selected.supplier || movementNote.trim() || null,
              invoiceNumber: purchaseInvoiceNumber.trim() || null,
              amount:
                purchasePayment === "pending" && index === purchaseCount - 1
                  ? totalAmount - installmentAmount * (purchaseCount - 1)
                  : installmentAmount,
              dueDate:
                purchasePayment === "pending"
                  ? addMonths(purchaseDueDate, index)
                  : today(),
              status: purchasePayment,
              paymentMethod: purchasePayment === "paid" ? paymentMethod : null,
              origin: "stock",
              stockItemId: selected.id,
              createdBy: access.userId,
              createdAt: serverTimestamp(),
            },
          );
    }
    setSelected(null);
    onFeedback(
      `${movementType === "entrada" ? "Entrada" : "Saída"} registrada. Saldo atualizado: ${balance}.`,
    );
  }
  async function showQr(item: StockItem) {
    const { default: QRCode } = await import("qrcode");
    setQrItem(item);
    setQrImage(
      await QRCode.toDataURL(item.machineCode || `ORQ-MACHINE-${item.id}`, {
        width: 280,
        margin: 2,
      }),
    );
  }
  function printQr() {
    if (!qrItem || !qrImage) return;
    const popup = window.open(
      "",
      "_blank",
      "noopener,noreferrer,width=440,height=560",
    );
    if (!popup) return;
    popup.document.write(
      `<html><body style="font-family:Arial;text-align:center;padding:32px"><h1>${qrItem.name}</h1><img src="${qrImage}" style="width:280px"/><p>Orquestra Fit · ${qrItem.machineCode || qrItem.id}</p><button onclick="window.print()">Imprimir</button></body></html>`,
    );
    popup.document.close();
  }
  return (
    <div className="workspace-content stock-module">
      <section className="workspace-intro">
        <div>
          <span>OPERAÇÃO · GESTÃO</span>
          <h2>Estoque</h2>
          <p>
            Cadastre itens e altere saldos somente por movimentações
            registradas.
          </p>
        </div>
      </section>
      <div className="stock-summary">
        <article>
          <Package />
          <span>
            Produtos<strong>{products.length}</strong>
          </span>
        </article>
        <article>
          <Wrench />
          <span>
            Máquinas<strong>{machines.length}</strong>
          </span>
        </article>
        <article>
          <Boxes />
          <span>
            Uso interno<strong>{internalItems.length}</strong>
          </span>
        </article>
        <article className={lowStock.length ? "stock-warning" : "stock-ok"}>
          <AlertTriangle />
          <span>
            Reposição<strong>{lowStock.length}</strong>
          </span>
        </article>
      </div>
      <div className="stock-layout">
        <form className="workspace-panel stock-form" onSubmit={saveItem}>
          <header>
            <div>
              <span>{editingId ? "EDITAR CADASTRO" : "NOVO CADASTRO"}</span>
              <h3>
                {editingId
                  ? "Editar item"
                  : kind === "machine"
                    ? "Cadastrar máquina ou aparelho"
                    : kind === "internal"
                      ? "Cadastrar material interno"
                      : "Cadastrar produto"}
              </h3>
            </div>
          </header>
          <div className="stock-kind-tabs">
            <button
              type="button"
              className={kind === "product" ? "active" : ""}
              onClick={() => setKind("product")}
            >
              <Package /> Produto de venda
            </button>
            <button
              type="button"
              className={kind === "machine" ? "active" : ""}
              onClick={() => setKind("machine")}
            >
              <Wrench /> Máquina/aparelho
            </button>
            <button
              type="button"
              className={kind === "internal" ? "active" : ""}
              onClick={() => setKind("internal")}
            >
              <Boxes /> Material interno
            </button>
          </div>
          <label>
            Nome
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label>
            Categoria
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Sem categoria</option>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <div className="stock-new-category">
            <input
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="Nova categoria"
            />
            <button type="button" onClick={() => void createCategory()}>
              Criar
            </button>
          </div>
          <label>
            Descrição
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label>
            Fornecedor
            <input
              value={supplier}
              onChange={(event) => setSupplier(event.target.value)}
              placeholder="Fornecedor padrão"
            />
          </label>
          <label>
            Preço de compra (R$)
            <input
              inputMode="decimal"
              value={purchasePrice}
              onChange={(event) => setPurchasePrice(event.target.value)}
              placeholder="0,00"
            />
          </label>
          {kind === "machine" && (
            <div className="machine-asset-fields">
              <label>Marca<input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Ex.: Life Fitness" /></label>
              <label>Modelo<input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Ex.: 9500HR" /></label>
              <label>Número de série<input value={serialNumber} onChange={(event) => setSerialNumber(event.target.value.toUpperCase())} /></label>
              <label>Localização<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Ex.: Sala de musculação" /></label>
              <label>Status<select value={equipmentStatus} onChange={(event) => setEquipmentStatus(event.target.value as NonNullable<StockItem["equipmentStatus"]>)}><option value="novo">Novo</option><option value="bom">Em uso · bom estado</option><option value="atencao">Atenção</option><option value="manutencao">Em manutenção</option><option value="interditado">Interditado</option></select></label>
              <label>Data da compra<input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} /></label>
              <label>Garantia até<input type="date" value={warrantyUntil} onChange={(event) => setWarrantyUntil(event.target.value)} /></label>
              <label>Próxima manutenção<input type="date" value={maintenanceDue} onChange={(event) => setMaintenanceDue(event.target.value)} /></label>
              <label>Técnico / empresa<input value={maintenanceProvider} onChange={(event) => setMaintenanceProvider(event.target.value)} /></label>
            </div>
          )}
          {kind === "product" && (
            <>
              <label>
                Preço de venda (R$)
                <input
                  inputMode="decimal"
                  value={salePrice}
                  onChange={(event) => setSalePrice(event.target.value)}
                  placeholder="0,00"
                />
              </label>
              <label>
                Código de barras
                <input
                  inputMode="numeric"
                  value={barcode}
                  onChange={(event) =>
                    setBarcode(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="EAN-13 ou interno"
                />
              </label>
            </>
          )}
          <label>
            Foto
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) setPhotoUrl(await readFile(file));
              }}
            />
          </label>
          {kind === "product" && (
            <label>
              Estoque mínimo
              <input
                type="number"
                min="0"
                step="1"
                value={minimum}
                onChange={(event) => setMinimum(event.target.value)}
              />
            </label>
          )}
          <div className="stock-form-actions">
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setName("");
                  setCategory("");
                  setDescription("");
                  setPurchasePrice("");
                  setSalePrice("");
                  setSupplier("");
                  setBarcode("");
                  setPhotoUrl("");
                  setBrand(""); setModel(""); setSerialNumber(""); setLocation(""); setEquipmentStatus("bom"); setPurchaseDate(""); setWarrantyUntil(""); setMaintenanceDue(""); setMaintenanceProvider("");
                }}
              >
                Cancelar
              </button>
            )}
            <button className="detail-save" type="submit">
              {editingId ? "Salvar alterações" : "Cadastrar"}
            </button>
          </div>
        </form>
        <section className="workspace-panel stock-list">
          <header>
            <div>
              <span>INVENTÁRIO GERAL</span>
              <h3>{visibleItems.length} item(ns)</h3>
            </div>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option>Todas</option>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </header>
          {visibleItems.map((item) => (
            <article
              key={item.id}
              className={
                item.kind === "product" && item.quantity <= item.minimum
                  ? "low-stock"
                  : ""
              }
            >
              {item.photoUrl ? (
                <img src={item.photoUrl} alt="" />
              ) : (
                <span className="stock-item-icon">
                  {item.kind === "machine" ? (
                    <Wrench />
                  ) : item.kind === "internal" ? (
                    <Boxes />
                  ) : (
                    <Package />
                  )}
                </span>
              )}
              <div>
                <strong>{item.name}</strong>
                <small>
                  {item.category || "Sem categoria"} ·{" "}
                  {item.description ||
                    (item.kind === "machine"
                      ? "Máquina/aparelho"
                      : item.kind === "internal"
                        ? "Material interno"
                        : "Produto")}
                </small>
                <small>
                  Saldo: {item.quantity} · Entradas: {item.entered} · Saídas:{" "}
                  {item.exited}
                </small>
                {item.purchasePrice ? (
                  <small>
                    Custo: {money(item.purchasePrice)}
                    {item.salePrice ? ` · Venda: ${money(item.salePrice)}` : ""}
                  </small>
                ) : null}
                {item.kind === "machine" && (
                  <small>
                    {[item.brand, item.model].filter(Boolean).join(" · ") || "Patrimônio"}
                    {item.location ? ` · ${item.location}` : ""}
                    {item.equipmentStatus ? ` · ${item.equipmentStatus}` : ""}
                    {item.maintenanceDue ? ` · manutenção ${item.maintenanceDue.split("-").reverse().join("/")}` : ""}
                  </small>
                )}
              </div>
              <div className="stock-item-actions">
                <button type="button" onClick={() => editItem(item)}>
                  Editar
                </button>
                <>
                  <button
                    type="button"
                    onClick={() => openMovement(item, "entrada")}
                  >
                    Entrada
                  </button>
                  <button
                    type="button"
                    onClick={() => openMovement(item, "saída")}
                  >
                    Saída
                  </button>
                </>
                {item.kind === "machine" && (
                  <button type="button" onClick={() => void showQr(item)}>
                    <QrCode /> QR
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      </div>
      <section className="workspace-panel stock-history">
        <header>
          <div>
            <span>RASTREABILIDADE</span>
            <h3>Histórico de movimentações</h3>
          </div>
        </header>
        {movements.length ? (
          movements.slice(0, 30).map((item) => (
            <p key={item.id}>
              <span>
                <strong>{item.itemName}</strong>
                <small>
                  {item.type} · {item.note || "Sem observação"}
                  {item.buyerName
                    ? ` · comprador: ${item.buyerName} · ${item.paymentMethod || ""} · ${money(item.totalAmount || 0)}`
                    : ""}{" "}
                  · {new Date(item.date).toLocaleDateString("pt-BR")}
                </small>
              </span>
              <b className={item.type}>
                {item.type === "entrada" ? "+" : "−"}
                {item.quantity} · saldo {item.balance ?? "—"}
              </b>
            </p>
          ))
        ) : (
          <p>Nenhuma movimentação registrada.</p>
        )}
      </section>
      {selected && (
        <div className="qr-modal-backdrop" role="dialog" aria-modal="true">
          <section className="qr-modal movement-modal">
            <button className="qr-close" onClick={() => setSelected(null)}>
              <X />
            </button>
            <span>MOVIMENTAÇÃO DE ESTOQUE</span>
            <h3>{selected.name}</h3>
            <div className="movement-type-tabs">
              <button
                type="button"
                className={movementType === "entrada" ? "active" : ""}
                onClick={() => setMovementType("entrada")}
              >
                Entrada / compra
              </button>
              <button
                type="button"
                className={movementType === "saída" ? "active" : ""}
                onClick={() => setMovementType("saída")}
              >
                Saída
              </button>
            </div>
            <form onSubmit={registerMovement}>
              <label>
                Quantidade
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={movementQuantity}
                  onChange={(event) => setMovementQuantity(event.target.value)}
                  required
                />
              </label>
              <label>
                Valor unitário
                <input
                  inputMode="decimal"
                  value={unitValue}
                  onChange={(event) => setUnitValue(event.target.value)}
                  placeholder="0,00"
                  required={
                    movementType === "saída" && selected.kind === "product"
                  }
                />
              </label>
              {movementType === "saída" && selected.kind === "product" && (
                <>
                  <label>
                    Quem comprou?
                    <input
                      value={buyerName}
                      onChange={(event) => setBuyerName(event.target.value)}
                      placeholder="Nome do aluno ou cliente"
                    />
                  </label>
                  <label>
                    Forma de pagamento
                    <select
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value)}
                    >
                      <option>Pix</option>
                      <option>Cartão de débito</option>
                      <option>Cartão de crédito</option>
                      <option>Dinheiro</option>
                      <option>Transferência</option>
                    </select>
                  </label>
                </>
              )}
              {movementType === "entrada" && (
                <>
                  <label>
                    Condição da compra
                    <select
                      value={purchasePayment}
                      onChange={(event) =>
                        setPurchasePayment(
                          event.target.value as "paid" | "pending",
                        )
                      }
                    >
                      <option value="paid">Pago à vista</option>
                      <option value="pending">A prazo / conta a pagar</option>
                    </select>
                  </label>
                  {purchasePayment === "pending" && (
                    <>
                      <label>
                        Primeiro vencimento
                        <input
                          type="date"
                          value={purchaseDueDate}
                          onChange={(event) =>
                            setPurchaseDueDate(event.target.value)
                          }
                          required
                        />
                      </label>
                      <label>
                        Quantidade de parcelas
                        <input
                          type="number"
                          min="1"
                          max="36"
                          value={purchaseInstallments}
                          onChange={(event) =>
                            setPurchaseInstallments(event.target.value)
                          }
                        />
                      </label>
                    </>
                  )}
                  <label>
                    Fornecedor da compra
                    <input
                      value={selected.supplier || ""}
                      readOnly
                      placeholder="Definido no cadastro do item"
                    />
                  </label>
                  <label>
                    Número da nota fiscal
                    <input
                      value={purchaseInvoiceNumber}
                      onChange={(event) =>
                        setPurchaseInvoiceNumber(
                          event.target.value.toLocaleUpperCase("pt-BR"),
                        )
                      }
                      placeholder="NF 0000"
                    />
                  </label>
                  <label>
                    Forma de pagamento
                    <select
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value)}
                    >
                      <option>Pix</option>
                      <option>Cartão de débito</option>
                      <option>Cartão de crédito</option>
                      <option>Dinheiro</option>
                      <option>Transferência</option>
                    </select>
                  </label>
                  <label className="movement-check">
                    <input
                      type="checkbox"
                      checked={registerPurchase}
                      onChange={(event) =>
                        setRegisterPurchase(event.target.checked)
                      }
                    />{" "}
                    Registrar esta compra no Financeiro
                  </label>
                </>
              )}
              <label>
                Observação / fornecedor
                <input
                  value={movementNote}
                  onChange={(event) => setMovementNote(event.target.value)}
                  placeholder={
                    movementType === "entrada"
                      ? "Fornecedor, nota fiscal ou compra do patrimônio"
                      : selected.kind === "product"
                        ? "Venda"
                        : "Consumo, manutenção, perda ou descarte"
                  }
                />
              </label>
              <p>
                Saldo atual: <strong>{selected.quantity}</strong>
              </p>
              <button className="detail-save" type="submit">
                Registrar {movementType}
              </button>
            </form>
          </section>
        </div>
      )}
      {qrItem && (
        <div className="qr-modal-backdrop" role="dialog" aria-modal="true">
          <section className="qr-modal">
            <button className="qr-close" onClick={() => setQrItem(null)}>
              <X />
            </button>
            <span>MÁQUINA · QR CODE</span>
            <h3>{qrItem.name}</h3>
            <img src={qrImage} alt={`QR Code de ${qrItem.name}`} />
            <p>
              Posicione este código na máquina para leitura pelo aplicativo.
            </p>
            <button className="detail-save" onClick={printQr}>
              <Download /> Imprimir QR Code
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
