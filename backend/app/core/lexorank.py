def calculate_midpoint_rank(prev_rank: str | None = None, next_rank: str | None = None) -> str:
    """
    Calculates a fractional midpoint string between two LexoRank positions using base-36 ASCII.
    Ensures O(1) card reordering without modifying surrounding items.
    """
    # Default initial rank if column is empty
    if not prev_rank and not next_rank:
        return "0|h00000:"

    # If prepending before first item
    if not prev_rank and next_rank:
        return _rank_before(next_rank)

    # If appending after last item
    if prev_rank and not next_rank:
        return _rank_after(prev_rank)

    # If inserting strictly between two ranks
    return _rank_between(prev_rank, next_rank)


def _char_val(c: str) -> int:
    if "0" <= c <= "9":
        return ord(c) - ord("0")
    if "a" <= c <= "z":
        return ord(c) - ord("a") + 10
    return 0


def _val_to_char(v: int) -> str:
    if 0 <= v <= 9:
        return chr(ord("0") + v)
    if 10 <= v <= 35:
        return chr(ord("a") + v - 10)
    return "0"


def _clean_rank(rank: str) -> str:
    if rank.startswith("0|") and rank.endswith(":"):
        return rank[2:-1]
    return rank


def _format_rank(inner: str) -> str:
    return f"0|{inner}:"


def _rank_before(next_rank: str) -> str:
    inner = _clean_rank(next_rank)
    if not inner:
        return "0|000000:"
    
    first_val = _char_val(inner[0])
    if first_val > 1:
        new_val = first_val // 2
        return _format_rank(_val_to_char(new_val) + inner[1:])
    else:
        # Prepend '0'
        return _format_rank("0" + inner)


def _rank_after(prev_rank: str) -> str:
    inner = _clean_rank(prev_rank)
    if not inner:
        return "0|h00000:"
    
    first_val = _char_val(inner[0])
    if first_val < 35:
        step = max(1, (35 - first_val) // 2)
        new_val = min(35, first_val + step)
        return _format_rank(_val_to_char(new_val) + inner[1:])
    else:
        return _format_rank(inner + "h")


def _rank_between(prev_rank: str, next_rank: str) -> str:
    prev_inner = _clean_rank(prev_rank)
    next_inner = _clean_rank(next_rank)

    max_len = max(len(prev_inner), len(next_inner)) + 2
    p_padded = prev_inner.ljust(max_len, "0")
    n_padded = next_inner.ljust(max_len, "0")

    result_chars = []
    carry = 0
    diff_found = False

    for p_c, n_c in zip(p_padded, n_padded):
        pv = _char_val(p_c)
        nv = _char_val(n_c)

        if not diff_found:
            if pv == nv:
                result_chars.append(p_c)
            else:
                diff_found = True
                mid = (pv + nv) // 2
                if mid > pv:
                    result_chars.append(_val_to_char(mid))
                    break
                else:
                    result_chars.append(p_c)
        else:
            mid = (pv + 36) // 2
            result_chars.append(_val_to_char(mid))
            break

    # Strip trailing zeroes
    res_str = "".join(result_chars).rstrip("0")
    if not res_str or res_str <= prev_inner:
        res_str = prev_inner + "h"

    return _format_rank(res_str)
