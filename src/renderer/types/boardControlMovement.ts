import { BoardMovement } from './boardMovement';
import { BoardOrderProduct } from './boardOrderProduct';

export interface BoardControlMovement extends BoardMovement {
  products: BoardOrderProduct[];
  isBoardPaid: boolean;
  total: number;
  formattedTotal: string;
  totalPaid: number;
  formattedTotalPaid: string;
  discount: number;
  formattedDiscount: string;
}
