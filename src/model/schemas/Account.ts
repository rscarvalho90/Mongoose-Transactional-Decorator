import mongoose, {Schema} from "mongoose";

export const accountSchema = new Schema(
    {
        account_number: {type: Number, required: true},
        account_balance: {type: Number, required: true},
        is_blocked: {type: Boolean, required: true}
    });
export const Account = mongoose.model("Account", accountSchema);